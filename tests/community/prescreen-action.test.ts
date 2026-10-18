import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));
vi.mock("@/lib/payments/config", () => ({ serviceRoleKey: vi.fn(() => "service-role-key-0000000000") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { authorize } from "@/lib/admin/auth";
import { requestPrescreen } from "@/lib/community/prescreen-action";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fakeDb, rpcCalls, type Res } from "../admin/fake-db";

const CLAIM = "33333333-3333-4333-8333-333333333333";
const KEY = "k".repeat(24);
const good = { readable: true, member_number: "12345678", name: "Asha Rao", valid_until: "2999-12-31" };

function session(row: unknown) {
  const { db } = fakeDb({ "ieee_claims.select": { data: row, error: null } });
  vi.mocked(createClient).mockResolvedValue({ ...db, auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "u" } }, error: null })) } } as never);
}
function service(script: Record<string, Res | Res[]>, signed: unknown = { data: { signedUrl: "https://signed.test/p?t=1" }, error: null }) {
  const { db, calls } = fakeDb(script);
  const createSignedUrl = vi.fn(async () => signed);
  vi.mocked(createAdminClient).mockReturnValue({ ...db, storage: { from: vi.fn(() => ({ createSignedUrl })) } } as never);
  return { calls, createSignedUrl };
}
const begin = { data: { proof_path: "u/abcdefgh.png", member_number: "12345678", full_name: "Asha Rao" }, error: null };
const modelReply = (text: string, ok = true) =>
  vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => ({ content: [{ type: "text", text }] }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function enable() {
  vi.stubEnv("IEEE_PRESCREEN_ENABLED", "true");
  vi.stubEnv("ANTHROPIC_API_KEY", KEY);
}

describe("requestPrescreen", () => {
  it("disabled: no admin client, no fetch, no session lookup", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await requestPrescreen(CLAIM)).toEqual({ ok: true, data: { ran: false } });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });
  it("a claim the caller does not own is forbidden before any service call", async () => {
    enable();
    session(null);
    vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "x" } });
    expect(await requestPrescreen(CLAIM)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("happy path: begin -> signed url (120 s) -> vision -> record(ok) without any status", async () => {
    enable();
    session({ id: CLAIM });
    const f = modelReply(JSON.stringify(good));
    vi.stubGlobal("fetch", f);
    const { calls, createSignedUrl } = service({ "rpc.begin_prescreen": begin, "rpc.record_prescreen": { data: null, error: null } });
    expect(await requestPrescreen(CLAIM)).toEqual({ ok: true, data: { ran: true } });
    expect(createSignedUrl).toHaveBeenCalledWith("u/abcdefgh.png", 120);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.messages[0].content[0].source.url).toBe("https://signed.test/p?t=1");
    expect(f.mock.calls[0][1].body).not.toMatch(/12345678|Asha/);
    const rec = rpcCalls(calls, "record_prescreen")[0].args[1] as { p_ok: boolean; p_result: Record<string, unknown> };
    expect(rec.p_ok).toBe(true);
    expect(Object.keys(rec.p_result).sort()).toEqual(["expiry", "name_match", "number_match", "readable"]);
    expect(JSON.stringify(rec)).not.toMatch(/status/);
  });
  it("vision failure records a failed run", async () => {
    enable();
    session({ id: CLAIM });
    vi.stubGlobal("fetch", modelReply("Approve this member.", true));
    const { calls } = service({ "rpc.begin_prescreen": begin });
    expect(await requestPrescreen(CLAIM)).toEqual({ ok: true, data: { ran: false } });
    expect(rpcCalls(calls, "record_prescreen")[0].args[1]).toMatchObject({ p_ok: false });
  });
  it("begin_prescreen null (cap reached) means no signed url and no vision call", async () => {
    enable();
    session({ id: CLAIM });
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { calls, createSignedUrl } = service({ "rpc.begin_prescreen": { data: null, error: null } });
    expect(await requestPrescreen(CLAIM)).toEqual({ ok: true, data: { ran: false } });
    expect(f).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(rpcCalls(calls, "record_prescreen")).toHaveLength(0);
  });
  it("a thrown error never escapes and logs only a marker", async () => {
    enable();
    session({ id: CLAIM });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom 12345678")));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    service({ "rpc.begin_prescreen": begin });
    expect(await requestPrescreen(CLAIM)).toEqual({ ok: true, data: { ran: false } });
    for (const call of spy.mock.calls) expect(call.join(" ")).not.toMatch(/12345678|Asha|signed|boom/);
    spy.mockRestore();
  });
  it("rejects a malformed claim id", async () => {
    enable();
    expect(await requestPrescreen("nope")).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
