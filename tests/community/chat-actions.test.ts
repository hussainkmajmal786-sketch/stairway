import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/admin/auth";
import { blockUser, closeThread, flagMessage, unblockUser } from "@/lib/community/chat-actions";
import { fakeDb, rpcCalls, type Res } from "../admin/fake-db";

const ID = "55555555-5555-4555-8555-555555555555";

function asSuper(script: Record<string, Res | Res[]> = {}) {
  const { db, calls } = fakeDb(script);
  vi.mocked(authorize).mockResolvedValue({ ok: true, ctx: { userId: "me", isSuper: true, societyIds: [] }, db: db as never, societyId: null });
  return calls;
}
const CALLS: [string, () => Promise<unknown>][] = [
  ["closeThread", () => closeThread(ID)],
  ["blockUser", () => blockUser({ userId: ID, reason: "abuse" })],
  ["unblockUser", () => unblockUser(ID)],
  ["flagMessage", () => flagMessage(7)],
];

beforeEach(() => vi.clearAllMocks());

describe("chat-actions authorisation", () => {
  it.each(CALLS)("%s: non-super is forbidden with zero DB calls", async (_n, run) => {
    const { calls } = (() => {
      const f = fakeDb();
      vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "x" } });
      return f;
    })();
    expect(await run()).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(authorize).toHaveBeenCalledWith({ kind: "super" });
    expect(calls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("chat-actions validation", () => {
  it("rejects invalid ids/reasons with zero RPC calls", async () => {
    const calls = asSuper();
    expect(await closeThread("nope")).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await unblockUser(42)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await blockUser({ userId: ID, reason: "because" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await blockUser({ userId: ID, reason: "abuse", extra: 1 })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    for (const bad of ["7", -1, 1.5, 0, null]) expect(await flagMessage(bad)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(rpcCalls(calls)).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("chat-actions success", () => {
  it("calls the matching RPC with the parsed arguments and revalidates", async () => {
    const calls = asSuper();
    expect(await closeThread(ID)).toEqual({ ok: true, data: undefined });
    expect(await blockUser({ userId: ID, reason: "spam" })).toEqual({ ok: true, data: undefined });
    expect(await unblockUser(ID)).toEqual({ ok: true, data: undefined });
    expect(await flagMessage(7)).toEqual({ ok: true, data: undefined });
    expect(rpcCalls(calls).map((c) => c.args)).toEqual([
      ["admin_chat_close", { p_thread_id: ID }],
      ["admin_chat_block", { p_user_id: ID, p_reason: "spam" }],
      ["admin_chat_unblock", { p_user_id: ID }],
      ["admin_chat_flag", { p_message_id: 7 }],
    ]);
    expect(revalidatePath).toHaveBeenCalledTimes(4);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/chat");
  });

  it("maps database errors without echoing SQL text and does not revalidate", async () => {
    asSuper({ "rpc.admin_chat_block": { data: null, error: { message: "admin_account", code: "P0001" } } });
    expect(await blockUser({ userId: ID, reason: "abuse" })).toMatchObject({ ok: false, error: { code: "locked" } });
    asSuper({ "rpc.admin_chat_flag": { data: null, error: { message: "not_found", code: "P0001" } } });
    expect(await flagMessage(9)).toMatchObject({ ok: false, error: { code: "not_found" } });
    asSuper({ "rpc.admin_chat_close": { data: null, error: { message: "select secret from x", code: "XX000" } } });
    const r = await closeThread(ID);
    expect(r).toMatchObject({ ok: false, error: { code: "unknown" } });
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
