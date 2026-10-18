import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));
vi.mock("@/lib/site/load", () => ({ getSiteData: vi.fn(async () => ({ settings: { siteUrl: "https://site.test/" } })) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/admin/auth";
import { acceptInviteAction, createInviteAction, revokeInviteAction, revokeRoleAction, searchPeopleAction } from "@/lib/admin/people-actions";
import { createClient } from "@/lib/supabase/server";
import { fakeDb, rpcCalls, wrote } from "./fake-db";

const SOC = "11111111-1111-4111-8111-111111111111";
const ROLE = "22222222-2222-4222-8222-222222222222";
const ME = "33333333-3333-4333-8333-333333333333";
const TOKEN = "A".repeat(43);

const asSuper = (db: unknown) =>
  vi.mocked(authorize).mockResolvedValue({ ok: true, ctx: { userId: ME, isSuper: true, societyIds: [] }, db: db as never, societyId: null });
const denied = () => vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "x" } });

beforeEach(() => vi.clearAllMocks());

describe("authorization matrix", () => {
  it("every people action is super-admin only", async () => {
    denied();
    const results = await Promise.all([
      createInviteAction({ email: "a@b.co", role: "super_admin" }),
      revokeInviteAction({ inviteId: ROLE }),
      revokeRoleAction({ roleId: ROLE }),
      searchPeopleAction({ q: "abc" }),
    ]);
    for (const r of results) expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(authorize).toHaveBeenCalledTimes(4);
    for (const c of vi.mocked(authorize).mock.calls) expect(c[0]).toEqual({ kind: "super" });
  });
});

describe("createInviteAction", () => {
  const open = { "admin_invites.select": { data: null, error: null, count: 0 }, "admin_invites.insert": { data: null, error: null } };
  it("needs a society for the society role and forbids one for super", async () => {
    const { db } = fakeDb(open);
    asSuper(db);
    expect(await createInviteAction({ email: "a@b.co", role: "society_admin" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await createInviteAction({ email: "a@b.co", role: "super_admin", societyId: SOC })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });
  it("rejects a society that does not exist", async () => {
    const { db, calls } = fakeDb({ ...open, "societies.select": { data: null, error: null } });
    asSuper(db);
    expect(await createInviteAction({ email: "a@b.co", role: "society_admin", societyId: SOC })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(wrote(calls, "admin_invites", "insert")).toHaveLength(0);
  });
  it("stores only the hash, returns the link once, never leaks the token elsewhere", async () => {
    const { db, calls } = fakeDb({ ...open, "societies.select": { data: { id: SOC }, error: null } });
    asSuper(db);
    const r = await createInviteAction({ email: "  Person@Example.COM ", role: "society_admin", societyId: SOC });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const token = r.data.url.split("/invite/")[1];
    expect(r.data.url).toBe(`https://site.test/invite/${token}`);
    expect(token).toHaveLength(43);
    const ins = wrote(calls, "admin_invites", "insert");
    expect(ins).toHaveLength(1);
    const row = ins[0].args[0] as Record<string, unknown>;
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.email).toBe("person@example.com");
    expect(row.created_by).toBe(ME);
    expect(JSON.stringify(calls)).not.toContain(token);
    expect(vi.mocked(revalidatePath).mock.calls.flat().join(" ")).not.toContain(token);
  });
  it("refuses the 51st open invite", async () => {
    const { db, calls } = fakeDb({ ...open, "admin_invites.select": { data: null, error: null, count: 50 } });
    asSuper(db);
    expect(await createInviteAction({ email: "a@b.co", role: "super_admin" })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(wrote(calls, "admin_invites", "insert")).toHaveLength(0);
  });
  it("rejects a bad email", async () => {
    const { db } = fakeDb(open);
    asSuper(db);
    expect(await createInviteAction({ email: "nope", role: "super_admin" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });
});

describe("revokeRoleAction", () => {
  it("refuses your own role", async () => {
    const { db, calls } = fakeDb({ "admin_roles.select": { data: { id: ROLE, user_id: ME }, error: null } });
    asSuper(db);
    expect(await revokeRoleAction({ roleId: ROLE })).toMatchObject({ ok: false, error: { code: "locked" } });
    expect(wrote(calls, "admin_roles", "delete")).toHaveLength(0);
  });
  it("surfaces the last-super-admin block nicely", async () => {
    const { db } = fakeDb({
      "admin_roles.select": { data: { id: ROLE, user_id: "other" }, error: null },
      "admin_roles.delete": { data: null, error: { message: "last_super_admin", code: "P0001" } },
    });
    asSuper(db);
    expect(await revokeRoleAction({ roleId: ROLE })).toMatchObject({ ok: false, error: { code: "locked", message: expect.stringContaining("super admin") } });
  });
  it("deletes another admin's role", async () => {
    const { db } = fakeDb({
      "admin_roles.select": { data: { id: ROLE, user_id: "other" }, error: null },
      "admin_roles.delete": { data: [{ id: ROLE }], error: null },
    });
    asSuper(db);
    expect(await revokeRoleAction({ roleId: ROLE })).toEqual({ ok: true, data: undefined });
  });
});

describe("revokeInviteAction", () => {
  it("revokes an open invite and reports a missing one", async () => {
    asSuper(fakeDb({ "admin_invites.update": { data: [{ id: ROLE }], error: null } }).db);
    expect(await revokeInviteAction({ inviteId: ROLE })).toMatchObject({ ok: true });
    asSuper(fakeDb({ "admin_invites.update": { data: [], error: null } }).db);
    expect(await revokeInviteAction({ inviteId: ROLE })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("searchPeopleAction", () => {
  it("returns only id, handle, fullName, college", async () => {
    const { db } = fakeDb({
      "profiles.select": { data: [{ id: "i", handle: "h", full_name: "N", college: "C", email: "leak@x.y", phone: "1" }], error: null },
    });
    asSuper(db);
    const r = await searchPeopleAction({ q: "ha" });
    expect(r).toEqual({ ok: true, data: [{ id: "i", handle: "h", fullName: "N", college: "C" }] });
  });
});

describe("acceptInviteAction", () => {
  const session = (db: unknown) => vi.mocked(createClient).mockResolvedValue(db as never);
  const withClaims = (script: Parameters<typeof fakeDb>[0], signedIn = true) => {
    const f = fakeDb(script);
    session({ ...f.db, auth: { getClaims: async () => ({ data: { claims: signedIn ? { sub: ME } : null }, error: null }) } });
    return f;
  };
  it("malformed token: generic failure, no rpc", async () => {
    const { calls } = withClaims({});
    expect(await acceptInviteAction("short")).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await acceptInviteAction(undefined)).toMatchObject({ ok: false });
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("needs a session", async () => {
    const { calls } = withClaims({}, false);
    expect(await acceptInviteAction(TOKEN)).toMatchObject({ ok: false, error: { code: "not_signed_in" } });
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("sends only the hash and maps every rpc failure to one message", async () => {
    const { calls } = withClaims({ "rpc.accept_admin_invite": { data: null, error: { message: "invalid_invite" } } });
    const a = await acceptInviteAction(TOKEN);
    expect(a).toMatchObject({ ok: false, error: { code: "not_found" } });
    const args = rpcCalls(calls, "accept_admin_invite")[0].args[1] as { p_token_hash: string };
    expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(calls)).not.toContain(TOKEN);
    withClaims({ "rpc.accept_admin_invite": { data: null, error: { message: "something else", code: "XX" } } });
    const b = await acceptInviteAction(TOKEN);
    expect(b).toEqual(a);
  });
  it("redirects to /admin only on success", async () => {
    withClaims({ "rpc.accept_admin_invite": { data: { role: "society_admin", society_id: SOC }, error: null } });
    await expect(acceptInviteAction(TOKEN)).rejects.toThrow("REDIRECT:/admin");
  });
});
