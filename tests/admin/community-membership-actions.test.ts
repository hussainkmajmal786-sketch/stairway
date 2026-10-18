import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/admin/auth";
import { decideClaim, getProofUrl, importRosterChunk, revokeClaim } from "@/lib/community/membership-admin-actions";
import { defaultApprovalDate, prescreenChips } from "@/lib/community/membership-admin";
import { fakeDb, rpcCalls, type Res } from "./fake-db";

const CLAIM = "33333333-3333-4333-8333-333333333333";

function asSuper(script: Record<string, Res | Res[]> = {}, signed: unknown = { data: { signedUrl: "https://signed.test/x?t=1" }, error: null }) {
  const { db, calls } = fakeDb(script);
  const createSignedUrl = vi.fn(async () => signed);
  const from = vi.fn(() => ({ createSignedUrl }));
  const full = { ...db, storage: { from } };
  vi.mocked(authorize).mockResolvedValue({ ok: true, ctx: { userId: "me", isSuper: true, societyIds: [] }, db: full as never, societyId: null });
  return { calls, createSignedUrl, from };
}
function denied() {
  const { db, calls } = fakeDb();
  const from = vi.fn();
  vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "x" } });
  return { calls, from, db };
}

beforeEach(() => vi.clearAllMocks());

const CALLS: [string, () => Promise<unknown>][] = [
  ["importRosterChunk", () => importRosterChunk({ rows: [{ n: "12345678", e: "2027-01-01" }], replace: true })],
  ["decideClaim", () => decideClaim({ claimId: CLAIM, approve: false, reason: "other" })],
  ["revokeClaim", () => revokeClaim(CLAIM)],
  ["getProofUrl", () => getProofUrl(CLAIM)],
];

describe("authorisation", () => {
  it.each(CALLS)("%s: non-super (society admin, plain user, signed out) is forbidden with zero calls", async (_n, run) => {
    const d = denied();
    expect(await run()).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(authorize).toHaveBeenCalledWith({ kind: "super" });
    expect(d.calls).toHaveLength(0);
    expect(d.from).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("importRosterChunk", () => {
  it("rejects invalid payloads with zero RPC calls", async () => {
    const { calls } = asSuper();
    const tooMany = Array.from({ length: 1001 }, () => ({ n: "12345678", e: "2027-01-01" }));
    for (const bad of [null, {}, { rows: tooMany, replace: true }, { rows: [], replace: "yes" }, { rows: [{ n: 12345678, e: "x" }], replace: true }, { rows: [], replace: true, extra: 1 }]) {
      expect(await importRosterChunk(bad)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("forwards only {n,e,name} and maps the counts", async () => {
    const { calls } = asSuper({ "rpc.import_ieee_roster": { data: { rows: 2, extended: 1, auto_verified: 3 }, error: null } });
    const r = await importRosterChunk({
      rows: [{ n: "12345678", e: "2027-01-01", name: "Asha Rao", evil: "x" }, { n: "87654321", e: "2027-02-02" }],
      replace: true,
    });
    expect(r).toEqual({ ok: true, data: { rows: 2, extended: 1, autoVerified: 3 } });
    expect(rpcCalls(calls, "import_ieee_roster")[0].args[1]).toEqual({
      p_rows: [{ n: "12345678", e: "2027-01-01", name: "Asha Rao" }, { n: "87654321", e: "2027-02-02" }],
      p_replace: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/membership");
  });
  it("does not revalidate on failure and never echoes SQL text", async () => {
    asSuper({ "rpc.import_ieee_roster": { data: null, error: { message: "relation private.ieee_roster blows up", code: "XX000" } } });
    const r = await importRosterChunk({ rows: [], replace: false });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/ieee_roster/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("decideClaim", () => {
  it("rejects bad payloads with zero RPC calls", async () => {
    const { calls } = asSuper();
    for (const bad of [
      { claimId: "nope", approve: false, reason: "other" },
      { claimId: CLAIM, approve: true },
      { claimId: CLAIM, approve: true, verifiedUntil: "31/12/2027" },
      { claimId: CLAIM, approve: false },
      { claimId: CLAIM, approve: false, reason: "because" },
      { claimId: CLAIM, approve: false, reason: "other", verifiedUntil: "2027-01-01" },
    ]) {
      expect(await decideClaim(bad)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("approves and rejects through the RPC and revalidates", async () => {
    const { calls } = asSuper({ "rpc.admin_decide_claim": { data: null, error: null } });
    expect(await decideClaim({ claimId: CLAIM, approve: true, verifiedUntil: "2027-12-31" })).toEqual({ ok: true, data: undefined });
    expect(rpcCalls(calls, "admin_decide_claim")[0].args[1]).toMatchObject({ p_claim_id: CLAIM, p_approve: true, p_verified_until: "2027-12-31" });
    expect(await decideClaim({ claimId: CLAIM, approve: false, reason: "unreadable" })).toMatchObject({ ok: true });
    expect(rpcCalls(calls, "admin_decide_claim")[1].args[1]).toMatchObject({ p_approve: false, p_reason: "unreadable" });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });
  it("23505 is a conflict with the plan copy; invalid_date and not_found are mapped", async () => {
    asSuper({ "rpc.admin_decide_claim": { data: null, error: { message: "dup", code: "23505" } } });
    expect(await decideClaim({ claimId: CLAIM, approve: true, verifiedUntil: "2027-12-31" })).toMatchObject({
      ok: false, error: { code: "conflict", message: "That number is already verified on another account." },
    });
    asSuper({ "rpc.admin_decide_claim": { data: null, error: { message: "invalid_date", code: "P0001" } } });
    expect(await decideClaim({ claimId: CLAIM, approve: true, verifiedUntil: "2099-12-31" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    asSuper({ "rpc.admin_decide_claim": { data: null, error: { message: "not_found", code: "P0001" } } });
    expect(await decideClaim({ claimId: CLAIM, approve: false, reason: "other" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("revokeClaim", () => {
  it("validates the id, calls the RPC, revalidates only on success", async () => {
    const { calls } = asSuper({ "rpc.admin_revoke_claim": { data: null, error: null } });
    expect(await revokeClaim("nope")).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(rpcCalls(calls)).toHaveLength(0);
    expect(await revokeClaim(CLAIM)).toMatchObject({ ok: true });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });
});

describe("getProofUrl", () => {
  const okScript = {
    "rpc.admin_claim_proof": { data: "uid/abcdefgh.png", error: null },
    "rpc.log_admin_event": { data: null, error: null },
  };
  it("takes the path from the database, audits BEFORE signing, signs for 300 s", async () => {
    const order: string[] = [];
    const { calls, createSignedUrl } = asSuper(okScript);
    createSignedUrl.mockImplementation(async () => {
      order.push(`sign:${calls.filter((c) => c.args[0] === "log_admin_event").length}`);
      return { data: { signedUrl: "https://signed.test/x" }, error: null };
    });
    const r = await getProofUrl(CLAIM);
    expect(r).toEqual({ ok: true, data: { url: "https://signed.test/x" } });
    expect(order).toEqual(["sign:1"]); // exactly one audit row existed when the URL was minted
    expect(createSignedUrl).toHaveBeenCalledWith("uid/abcdefgh.png", 300);
    expect(rpcCalls(calls, "admin_claim_proof")[0].args[1]).toEqual({ p_claim_id: CLAIM });
    expect(rpcCalls(calls, "log_admin_event")[0].args[1]).toMatchObject({
      p_action: "membership.proof_view", p_target_type: "ieee_claim", p_target_id: CLAIM, p_summary: {},
    });
  });
  it("unknown claim: not_found, no audit row, no URL", async () => {
    const { calls, from } = asSuper({ "rpc.admin_claim_proof": { data: null, error: { message: "not_found", code: "P0001" } } });
    expect(await getProofUrl(CLAIM)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(rpcCalls(calls, "log_admin_event")).toHaveLength(0);
    expect(from).not.toHaveBeenCalled();
  });
  it("failed audit write means no URL is minted", async () => {
    const { from } = asSuper({ ...okScript, "rpc.log_admin_event": { data: null, error: { message: "x", code: "XX000" } } });
    expect(await getProofUrl(CLAIM)).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(from).not.toHaveBeenCalled();
  });
  it("a signing failure returns unavailable without leaking details", async () => {
    asSuper(okScript, { data: null, error: { message: "bucket secret" } });
    const r = await getProofUrl(CLAIM);
    expect(r).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(r)).not.toMatch(/bucket secret/);
  });
});

describe("read-model helpers", () => {
  it("defaultApprovalDate uses a valid pre-screen expiry else 31 Dec of this year", () => {
    const now = Date.UTC(2026, 9, 18);
    expect(defaultApprovalDate("2027-03-04", now)).toBe("2027-03-04");
    expect(defaultApprovalDate("2026-01-01", now)).toBe("2026-12-31");
    expect(defaultApprovalDate("2099-01-01", now)).toBe("2026-12-31");
    expect(defaultApprovalDate(null, now)).toBe("2026-12-31");
  });
  it("prescreenChips are always hints with words", () => {
    expect(prescreenChips({})).toEqual([{ text: "Auto-check not run", tone: "neutral" }]);
    expect(prescreenChips({ status: "done", readable: false })[0].text).toBe("Unreadable");
    const c = prescreenChips({ status: "done", readable: true, number_match: true, name_match: false, expiry: "2027-12-31" });
    expect(c.map((x) => x.text)).toEqual(["Number matches", "Name does not match", "Expiry read: 31 Dec 2027"]);
  });
});

describe("import boundary", () => {
  it("the roster and queue modules are imported only by /admin/membership code", () => {
    const ROOT = resolve(__dirname, "../..");
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(n)) out.push(p);
      }
      return out;
    };
    const files = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)));
    const importers = files
      .filter((f) => /components\/admin\/community\/(?:RosterUploader|ReviewQueue|VerifiedList)|membership-admin-actions/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f).replace(/\\/g, "/"))
      .filter((p) => !p.startsWith("components/admin/community/") && p !== "lib/community/membership-admin-actions.ts");
    expect(importers).toEqual(["app/admin/membership/page.tsx"]);
  });
});
