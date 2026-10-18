import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));
vi.mock("@/lib/payments/config", () => ({ serviceRoleKey: vi.fn(() => "service-role-key-0000000000") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { authorize } from "@/lib/admin/auth";
import { anonymiseUserAction } from "@/lib/admin/anonymise-action";
import { createAdminClient } from "@/lib/supabase/admin";
import { fakeDb, rpcCalls } from "./fake-db";

const UID = "44444444-4444-4444-8444-444444444444";
const asSuper = (db: unknown) =>
  vi.mocked(authorize).mockResolvedValue({ ok: true, ctx: { userId: "me", isSuper: true, societyIds: [] }, db: db as never, societyId: null });
const storage = (over: { list?: unknown; remove?: unknown } = {}) => {
  const bucket = {
    list: vi.fn(async () => over.list ?? { data: [{ name: "a.webp" }, { name: "b.png" }], error: null }),
    remove: vi.fn(async () => over.remove ?? { data: [], error: null }),
  };
  vi.mocked(createAdminClient).mockReturnValue({ storage: { from: vi.fn(() => bucket) } } as never);
  return bucket;
};
const ok = {
  "profiles.select": { data: { handle: "amy" }, error: null },
  "rpc.anonymise_user": { data: { registrations_kept: 2 }, error: null },
};

beforeEach(() => vi.clearAllMocks());

describe("anonymiseUserAction", () => {
  it("society admin is forbidden: no rpc, no storage", async () => {
    vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "x" } });
    expect(await anonymiseUserAction({ userId: UID, confirmHandle: "amy" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(authorize).toHaveBeenCalledWith({ kind: "super" });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("wrong confirmation: invalid_input and no rpc", async () => {
    const { db, calls } = fakeDb(ok);
    asSuper(db);
    expect(await anonymiseUserAction({ userId: UID, confirmHandle: "AMY" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(rpcCalls(calls)).toHaveLength(0);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("database refusal (admin / open seat) happens before any storage call", async () => {
    const { db } = fakeDb({ ...ok, "rpc.anonymise_user": { data: null, error: { message: "open_registrations", code: "P0001" } } });
    asSuper(db);
    expect(await anonymiseUserAction({ userId: UID, confirmHandle: "amy" })).toMatchObject({ ok: false, error: { code: "locked" } });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("runs the rpc on the session client, then removes only the user's avatar objects", async () => {
    const { db, calls } = fakeDb(ok);
    asSuper(db);
    const bucket = storage();
    const r = await anonymiseUserAction({ userId: UID, confirmHandle: "amy" });
    expect(r).toEqual({ ok: true, data: { registrationsKept: 2, avatarsRemoved: true } });
    expect(rpcCalls(calls, "anonymise_user")[0].args[1]).toEqual({ p_user_id: UID });
    expect(bucket.list).toHaveBeenCalledWith(UID, expect.objectContaining({ limit: 100 }));
    expect(bucket.remove).toHaveBeenCalledWith([`${UID}/a.webp`, `${UID}/b.png`]);
  });
  it("storage failure after a successful rpc is still ok with avatarsRemoved false", async () => {
    const { db } = fakeDb(ok);
    asSuper(db);
    storage({ list: { data: null, error: { message: "boom" } } });
    expect(await anonymiseUserAction({ userId: UID, confirmHandle: "amy" })).toEqual({
      ok: true, data: { registrationsKept: 2, avatarsRemoved: false },
    });
  });
});
