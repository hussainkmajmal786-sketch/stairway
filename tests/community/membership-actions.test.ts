import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { revalidatePath } from "next/cache";
import { submitClaim } from "@/lib/community/membership-actions";
import { createClient } from "@/lib/supabase/server";
import { fakeDb, rpcCalls, type Res } from "../admin/fake-db";

const UID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CLAIM = "33333333-3333-4333-8333-333333333333";

function setup(script: Record<string, Res | Res[]> = {}, sub: string | null = UID) {
  const { db, calls } = fakeDb(script);
  const withAuth = { ...db, auth: { getClaims: vi.fn(async () => ({ data: sub ? { claims: { sub } } : null, error: null })) } };
  vi.mocked(createClient).mockResolvedValue(withAuth as never);
  return calls;
}

beforeEach(() => vi.clearAllMocks());

describe("submitClaim", () => {
  it("signed out: not_signed_in and no RPC", async () => {
    const calls = setup({}, null);
    expect(await submitClaim({ memberNumber: "12345678", proofPath: null })).toMatchObject({ ok: false, error: { code: "not_signed_in" } });
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("invalid input never reaches the database", async () => {
    const calls = setup();
    for (const bad of [
      null, {}, { memberNumber: "12345678x", proofPath: null },
      { memberNumber: "12345678", proofPath: "../../etc/passwd" }, { memberNumber: "12345678", proofPath: null, extra: 1 },
    ]) {
      expect(await submitClaim(bad)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("rejects a proof path in another user's folder before any RPC", async () => {
    const calls = setup();
    const r = await submitClaim({ memberNumber: "12345678", proofPath: `${OTHER}/abcdefgh12345678.png` });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("pads a 7 digit number to the 8 digit form before the RPC", async () => {
    const calls = setup({ "rpc.submit_ieee_claim": { data: { status: "proof_required" }, error: null } });
    await submitClaim({ memberNumber: "1234567", proofPath: null });
    expect(rpcCalls(calls, "submit_ieee_claim")[0].args[1]).toEqual({ p_member_number: "01234567", p_proof_path: null });
  });
  it("passes proof_required and rate_limited through as data", async () => {
    for (const status of ["proof_required", "rate_limited"]) {
      const calls = setup({ "rpc.submit_ieee_claim": { data: { status }, error: null } });
      expect(await submitClaim({ memberNumber: " 12345678 ", proofPath: null })).toEqual({ ok: true, data: { status } });
      expect(rpcCalls(calls, "submit_ieee_claim")[0].args[1]).toEqual({ p_member_number: "12345678", p_proof_path: null });
    }
  });
  it("returns the claim id for pending_review and revalidates", async () => {
    setup({ "rpc.submit_ieee_claim": { data: { status: "pending_review", claim_id: CLAIM, verified_until: null }, error: null } });
    const path = `${UID}/abcdefgh12345678.png`;
    expect(await submitClaim({ memberNumber: "12345678", proofPath: path })).toEqual({ ok: true, data: { status: "pending_review", claimId: CLAIM } });
    expect(revalidatePath).toHaveBeenCalledWith("/me/membership");
  });
  it("an unknown status is an error (no `unavailable` outcome exists)", async () => {
    setup({ "rpc.submit_ieee_claim": { data: { status: "unavailable" }, error: null } });
    expect(await submitClaim({ memberNumber: "12345678", proofPath: null })).toMatchObject({ ok: false, error: { code: "unknown" } });
  });
  it("maps database errors to neutral copy and never echoes SQL text", async () => {
    setup({ "rpc.submit_ieee_claim": { data: null, error: { message: "invalid_proof", code: "P0001" } } });
    const r = await submitClaim({ memberNumber: "12345678", proofPath: null });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    setup({ "rpc.submit_ieee_claim": { data: null, error: { message: 'duplicate key value violates "ieee_claims_number_verified"', code: "23505" } } });
    const r2 = await submitClaim({ memberNumber: "12345678", proofPath: null });
    expect(JSON.stringify(r2)).not.toMatch(/ieee_claims_number_verified|duplicate/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("createProofUpload", () => {
  async function run(input: unknown, sub: string | null = UID, signed: unknown = { data: { token: "tok", path: "x" }, error: null }) {
    const { db } = fakeDb();
    const createSignedUploadUrl = vi.fn(async () => signed);
    const from = vi.fn(() => ({ createSignedUploadUrl }));
    vi.mocked(createClient).mockResolvedValue({
      ...db, storage: { from },
      auth: { getClaims: vi.fn(async () => ({ data: sub ? { claims: { sub } } : null, error: null })) },
    } as never);
    const { createProofUpload } = await import("@/lib/community/membership-actions");
    return { r: await createProofUpload(input), from, createSignedUploadUrl };
  }
  it("signed out: nothing is issued", async () => {
    const { r, from } = await run({ type: "image/png" }, null);
    expect(r).toMatchObject({ ok: false, error: { code: "not_signed_in" } });
    expect(from).not.toHaveBeenCalled();
  });
  it("accepts only image types (no client-supplied path or name)", async () => {
    for (const bad of [{ type: "application/pdf" }, { type: "image/svg+xml" }, { type: "image/png", path: "../x" }, {}, null]) {
      const { r, from } = await run(bad);
      expect(r).toMatchObject({ ok: false, error: { code: "invalid_input" } });
      expect(from).not.toHaveBeenCalled();
    }
  });
  it("derives an unguessable path under the session user's folder in the private bucket", async () => {
    const { r, from, createSignedUploadUrl } = await run({ type: "image/webp" });
    expect(from).toHaveBeenCalledWith("ieee-proof");
    expect(r.ok && r.data.path).toMatch(new RegExp(`^${UID}/[0-9a-f-]{36}\.webp$`));
    expect(r.ok && r.data.token).toBe("tok");
    expect(createSignedUploadUrl).toHaveBeenCalledWith(r.ok ? r.data.path : "");
    const a = r.ok ? r.data.path : "";
    const b = (await run({ type: "image/webp" })).r;
    expect(b.ok && b.data.path).not.toBe(a);
  });
  it("storage failure is a uniform unavailable", async () => {
    const { r } = await run({ type: "image/png" }, UID, { data: null, error: { message: "secret detail" } });
    expect(r).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(r)).not.toMatch(/secret detail/);
  });
});
