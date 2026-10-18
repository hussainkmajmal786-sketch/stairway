import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/payments/config", () => ({ serviceRoleKey: vi.fn(() => "service-role-key-0000000000") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { headers } from "next/headers";
import { submitCommunityRequest } from "@/lib/community/forms-actions";
import { hashIp } from "@/lib/community/forms";
import { serviceRoleKey } from "@/lib/payments/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fakeDb, rpcCalls, type Res } from "../admin/fake-db";

const SALT = "s".repeat(20);
const old = () => Date.now() - 60_000;
const base = () => ({ name: "Asha Rao", email: "asha@example.com", subject: "A good subject", message: "A message that is long enough.", hp: "", startedAt: old() });
const partner = () => ({ ...base(), kind: "partner", details: { partnership_type: "sponsor" } });
const anon = () => ({ kind: "feedback", anonymous: true, subject: "Subject", message: "A message that is long enough.", hp: "", startedAt: old(), details: { category: "other" } });

function setup(script: Record<string, Res | Res[]> = {}, sub: string | null = "user-1") {
  const svc = fakeDb({ "rpc.submit_community_request": { data: { ok: true }, error: null }, ...script });
  vi.mocked(createAdminClient).mockReturnValue(svc.db as never);
  vi.mocked(createClient).mockResolvedValue({ auth: { getClaims: vi.fn(async () => ({ data: sub ? { claims: { sub } } : null, error: null })) } } as never);
  vi.mocked(headers).mockResolvedValue(new Headers({ "cf-connecting-ip": "1.2.3.4" }) as never);
  return svc.calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("COMMUNITY_HASH_SALT", SALT);
  vi.mocked(serviceRoleKey).mockReturnValue("service-role-key-0000000000");
});

describe("submitCommunityRequest", () => {
  it("rejects invalid payloads with zero RPC calls and no service client", async () => {
    const calls = setup();
    for (const bad of [null, {}, { ...partner(), message: "<b>x</b> hello there" }, { ...partner(), anonymous: true }, { ...partner(), details: {} },
      { ...partner(), details: { partnership_type: "sponsor", website: "http://example.org" } }, { ...partner(), message: "short" }]) {
      expect(await submitCommunityRequest(bad)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(rpcCalls(calls)).toHaveLength(0);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("fakes success for a filled honeypot and for a fast fill, with zero RPC calls and no service client", async () => {
    const calls = setup();
    expect(await submitCommunityRequest({ ...partner(), hp: "http://spam" })).toEqual({ ok: true, data: { received: true } });
    expect(await submitCommunityRequest({ ...partner(), startedAt: Date.now() - 1000 })).toEqual({ ok: true, data: { received: true } });
    expect(rpcCalls(calls)).toHaveLength(0);
    expect(createAdminClient).not.toHaveBeenCalled();
    // non-vacuous twin: a human payload makes exactly one call
    expect(await submitCommunityRequest(partner())).toEqual({ ok: true, data: { received: true } });
    expect(rpcCalls(calls)).toHaveLength(1);
  });

  it("sends the salted ip hash and the session user id, and an empty honeypot", async () => {
    const calls = setup();
    await submitCommunityRequest(partner());
    const args = rpcCalls(calls, "submit_community_request")[0].args[1] as Record<string, unknown>;
    expect(args.p_ip_hash).toBe(await hashIp("1.2.3.4", SALT));
    expect(args.p_user_id).toBe("user-1");
    expect(args.p_hp).toBe("");
    expect(args.p_kind).toBe("partner");
    expect(args.p_details).toEqual({ partnership_type: "sponsor" });
  });

  it("passes a null ip hash when the salt is missing and no user when signed out", async () => {
    vi.stubEnv("COMMUNITY_HASH_SALT", "");
    const calls = setup({}, null);
    await submitCommunityRequest(partner());
    const args = rpcCalls(calls)[0].args[1] as Record<string, unknown>;
    expect(args.p_ip_hash).toBeNull();
    expect(args.p_user_id).toBeUndefined();
  });

  it("anonymous feedback sends no identity at all", async () => {
    const calls = setup();
    expect(await submitCommunityRequest({ ...anon(), name: "Asha Rao" })).toMatchObject({ ok: false });
    expect(rpcCalls(calls)).toHaveLength(0);
    expect(await submitCommunityRequest(anon())).toMatchObject({ ok: true });
    const args = rpcCalls(calls)[0].args[1] as Record<string, unknown>;
    expect(args).toMatchObject({ p_anonymous: true, p_name: null, p_email: null, p_phone: null, p_organisation: null, p_ip_hash: null });
    expect(args.p_user_id).toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
    expect(headers).not.toHaveBeenCalled();
  });

  it.each([
    [{ message: "rate_limited", code: "P0001" }, "too_many"],
    [{ message: "busy", code: "P0001" }, "unavailable"],
    [{ message: "invalid_input", code: "P0001" }, "invalid_input"],
    [{ message: "new row violates check", code: "23514" }, "invalid_input"],
    [{ message: "select secret from x", code: "XX000" }, "unknown"],
  ])("maps %j to %s and never echoes the database text", async (err, code) => {
    setup({ "rpc.submit_community_request": { data: null, error: err } });
    const r = await submitCommunityRequest(partner());
    expect(r).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(r)).not.toMatch(/secret|violates|P0001/);
  });

  it("is unavailable without a service key", async () => {
    setup();
    vi.mocked(serviceRoleKey).mockReturnValue(null);
    expect(await submitCommunityRequest(partner())).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
