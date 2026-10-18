import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatThreadController, toMessage, sendErrorCode, USER_COLS, ADMIN_COLS, type ChatClient } from "@/lib/community/chat-thread";
import type { ChatMessage } from "@/lib/community/chat";

const T = "11111111-1111-4111-8111-111111111111";
const msg = (id: number, from_admin = false, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, thread_id: T, from_admin, body: `m${id}`, created_at: "2027-01-01T00:00:00Z", flagged_at: null, ...extra,
});

function setup(o: { viewer?: "user" | "admin"; threadId?: string | null; initial?: ChatMessage[]; rows?: unknown[][]; state?: unknown; visible?: boolean } = {}) {
  let visible = o.visible ?? true;
  const visCbs = new Set<() => void>();
  const rows = o.rows ?? [[]];
  const queries: { table: string; cols: string; eq: [string, unknown][]; gt: [string, unknown][] }[] = [];
  const rpcs: { name: string; args?: Record<string, unknown> }[] = [];
  let rtCb: ((p: { new?: unknown }) => void) | null = null;
  let statusCb: ((s: string) => void) | null = null;
  let authCb: ((e: string, s: { access_token: string } | null) => void) | null = null;
  const removed: unknown[] = [];
  const unsubscribed = vi.fn();
  const channels: { name: string; filter: unknown }[] = [];
  const rpcScript: Record<string, { data: unknown; error: { message?: string } | null }> = {
    chat_state: { data: o.state ?? { access: "member", thread_id: o.threadId ?? null, status: "open" }, error: null },
    chat_send: { data: { id: 99 }, error: null },
    chat_mark_read: { data: null, error: null },
  };
  let pollNo = 0;
  const chain = (table: string) => {
    const q = { table, cols: "", eq: [] as [string, unknown][], gt: [] as [string, unknown][] };
    queries.push(q);
    const b: Record<string, unknown> = {};
    b.select = (c: string) => { q.cols = c; return b; };
    b.eq = (c: string, v: unknown) => { q.eq.push([c, v]); return b; };
    b.gt = (c: string, v: unknown) => { q.gt.push([c, v]); return b; };
    b.order = () => b;
    b.limit = () => b;
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      let out: { data: unknown; error: unknown };
      if (table === "chat_threads") out = { data: o.threadId ? [{ id: o.threadId }] : [], error: null };
      else {
        const page = rows[Math.min(pollNo++, rows.length - 1)];
        out = page === undefined ? { data: null, error: { message: "down" } } : { data: page, error: null };
      }
      return Promise.resolve(out).then(res, rej);
    };
    return b;
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "tok-1" } } }),
      onAuthStateChange: (cb: (e: string, s: { access_token: string } | null) => void) => { authCb = cb; return { data: { subscription: { unsubscribe: unsubscribed } } }; },
    },
    realtime: { setAuth: vi.fn() },
    channel: (name: string) => {
      const ch = {
        on: (_t: string, filter: unknown, cb: (p: { new?: unknown }) => void) => { channels.push({ name, filter }); rtCb = cb; return ch; },
        subscribe: (cb: (s: string) => void) => { statusCb = cb; return ch; },
      };
      return ch;
    },
    removeChannel: (c: unknown) => removed.push(c),
    from: (t: string) => ({ select: (c: string) => (chain(t) as { select: (c: string) => unknown }).select(c) }),
    rpc: async (name: string, args?: Record<string, unknown>) => { rpcs.push({ name, args }); return rpcScript[name] ?? { data: null, error: null }; },
  };
  const c = new ChatThreadController({
    client: client as unknown as ChatClient,
    threadId: o.threadId === undefined ? T : o.threadId,
    initial: o.initial ?? [],
    viewer: o.viewer ?? "user",
    isVisible: () => visible,
    onVisibility: (cb) => { visCbs.add(cb); return () => visCbs.delete(cb); },
  });
  return {
    c, client, queries, rpcs, removed, channels, unsubscribed, rpcScript,
    setVisible(v: boolean) { visible = v; if (v) visCbs.forEach((f) => f()); },
    push: (row: unknown) => rtCb?.({ new: row }),
    status: (s: string) => statusCb?.(s),
    refreshToken: () => authCb?.("TOKEN_REFRESHED", { access_token: "tok-2" }),
    visListeners: () => visCbs.size,
  };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("realtime", () => {
  it("authenticates realtime, subscribes with the thread filter and merges pushed rows without duplicates", async () => {
    const h = setup({ initial: [msg(1)] });
    await h.c.start();
    await flush();
    expect(h.client.realtime.setAuth).toHaveBeenCalledWith("tok-1");
    expect(h.channels).toEqual([{ name: `chat:${T}`, filter: { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${T}` } }]);
    h.status("SUBSCRIBED");
    expect(h.c.getSnapshot().status).toBe("live");
    h.push({ ...msg(2, true), sender_id: "secret", flagged_at: "2027-01-02T00:00:00Z" });
    h.push(msg(2, true));
    h.push(msg(1));
    h.push({ ...msg(3), thread_id: "another-thread" });
    h.push({ junk: true });
    const ids = h.c.getSnapshot().messages.map((m) => m.id);
    expect(ids).toEqual([1, 2]);
    h.c.stop();
  });

  it("users never receive staff-only columns, admins do", async () => {
    const u = setup({ viewer: "user" });
    await u.c.start();
    u.push({ ...msg(5), flagged_at: "2027-01-02T00:00:00Z", sender_id: "x" });
    expect(u.c.getSnapshot().messages[0].flagged_at).toBeNull();
    expect(JSON.stringify(u.c.getSnapshot())).not.toContain("sender_id");
    u.c.stop();
    const a = setup({ viewer: "admin" });
    await a.c.start();
    a.push({ ...msg(5), flagged_at: "2027-01-02T00:00:00Z" });
    expect(a.c.getSnapshot().messages[0].flagged_at).toBe("2027-01-02T00:00:00Z");
    a.c.stop();
    expect(USER_COLS).not.toMatch(/flagged_at|sender_id/);
    expect(ADMIN_COLS).toContain("flagged_at");
  });

  it("refreshes the realtime token when the session token refreshes", async () => {
    const h = setup();
    await h.c.start();
    h.refreshToken();
    expect(h.client.realtime.setAuth).toHaveBeenLastCalledWith("tok-2");
    h.c.stop();
  });

  it("falls back to polling on channel errors and keeps working", async () => {
    const h = setup({ rows: [[], [msg(7, true)]] });
    await h.c.start();
    await flush();
    h.status("SUBSCRIBED");
    h.status("CHANNEL_ERROR");
    expect(h.c.getSnapshot().status).toBe("polling");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.c.getSnapshot().messages.map((m) => m.id)).toEqual([7]);
    h.c.stop();
  });
});

describe("polling", () => {
  it("works alone when realtime never connects, asking only for newer ids", async () => {
    const h = setup({ initial: [msg(1)], rows: [[msg(2, true)], [msg(3, true)]] });
    await h.c.start();
    await flush();
    expect(h.c.getSnapshot().messages.map((m) => m.id)).toEqual([1, 2]);
    expect(h.queries.find((q) => q.table === "chat_messages")?.gt).toEqual([["id", 1]]);
    expect(h.queries[0].cols).toBe(USER_COLS);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.c.getSnapshot().messages.map((m) => m.id)).toEqual([1, 2, 3]);
    h.c.stop();
  });

  it("polls only while the tab is visible and catches up immediately when it returns", async () => {
    const h = setup({ rows: [[]] });
    await h.c.start();
    await flush();
    const count = () => h.queries.filter((q) => q.table === "chat_messages").length;
    const base = count();
    h.setVisible(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(count()).toBe(base);
    h.setVisible(true);
    await flush();
    expect(count()).toBe(base + 1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(count()).toBe(base + 2);
    h.c.stop();
  });

  it("reports offline when the poll fails and recovers afterwards", async () => {
    const h = setup({ rows: [undefined as unknown as unknown[], []] });
    await h.c.start();
    await flush();
    expect(h.c.getSnapshot().status).toBe("offline");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.c.getSnapshot().status).toBe("polling");
    h.c.stop();
  });

  it("a user with no thread yet discovers it (after their first send) and starts listening", async () => {
    const h = setup({ threadId: null, rows: [[msg(1)]] });
    await h.c.start();
    await flush();
    expect(h.c.getSnapshot().threadId).toBeNull();
    expect(h.channels).toHaveLength(0);
    // the thread appears (first message sent): the next poll finds it
    (h.rpcScript.chat_state.data as Record<string, unknown>).thread_id = T;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.c.getSnapshot().threadId).toBe(T);
    expect(h.channels).toHaveLength(1);
    expect(h.c.getSnapshot().messages.map((m) => m.id)).toEqual([1]);
    h.c.stop();
  });

  it("surfaces lapsed access from chat_state", async () => {
    const h = setup({ state: { access: "none", thread_id: null, status: null } });
    await h.c.start();
    await flush();
    expect(h.c.getSnapshot().access).toBe("none");
    h.c.stop();
  });
});

describe("send", () => {
  it("users send with a null thread id, admins with the thread id", async () => {
    const u = setup({ viewer: "user" });
    await u.c.start();
    expect(await u.c.send("  hello  ")).toEqual({ ok: true });
    expect(u.rpcs.find((r) => r.name === "chat_send")?.args).toEqual({ p_thread_id: null, p_body: "hello" });
    u.c.stop();
    const a = setup({ viewer: "admin" });
    await a.c.start();
    await a.c.send("hi");
    expect(a.rpcs.find((r) => r.name === "chat_send")?.args).toEqual({ p_thread_id: T, p_body: "hi" });
    a.c.stop();
  });

  it("validates length locally before any RPC", async () => {
    const h = setup();
    await h.c.start();
    expect(await h.c.send("   ")).toEqual({ ok: false, code: "invalid_body" });
    expect(await h.c.send("x".repeat(1001))).toEqual({ ok: false, code: "invalid_body" });
    expect(h.rpcs.some((r) => r.name === "chat_send")).toBe(false);
    h.c.stop();
  });

  it("maps database errors to codes and marks lapsed/blocked access", async () => {
    const h = setup();
    await h.c.start();
    h.rpcScript.chat_send = { data: null, error: { message: "rate_limited" } };
    expect(await h.c.send("a")).toEqual({ ok: false, code: "rate_limited" });
    h.rpcScript.chat_send = { data: null, error: { message: "not_eligible" } };
    expect(await h.c.send("a")).toEqual({ ok: false, code: "not_eligible" });
    expect(h.c.getSnapshot().access).toBe("none");
    h.rpcScript.chat_send = { data: null, error: { message: "blocked" } };
    expect(await h.c.send("a")).toEqual({ ok: false, code: "blocked" });
    expect(h.c.getSnapshot().access).toBe("blocked");
    h.rpcScript.chat_send = { data: null, error: { message: "select * from secrets" } };
    expect(await h.c.send("a")).toEqual({ ok: false, code: "unknown" });
    expect(sendErrorCode({ message: "Failed to fetch" })).toBe("unavailable");
    h.c.stop();
  });
});

describe("markRead", () => {
  it("is debounced, visible-only and only when the newest message is from the other side", async () => {
    const h = setup({ viewer: "user", initial: [msg(1, true)] });
    await h.c.start();
    await flush();
    h.c.markRead();
    h.c.markRead();
    expect(h.rpcs.filter((r) => r.name === "chat_mark_read")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(h.rpcs.filter((r) => r.name === "chat_mark_read")).toEqual([{ name: "chat_mark_read", args: { p_thread_id: T } }]);
    h.c.markRead(); // same newest message again: nothing
    await vi.advanceTimersByTimeAsync(600);
    expect(h.rpcs.filter((r) => r.name === "chat_mark_read")).toHaveLength(1);
    h.c.stop();
    const own = setup({ viewer: "user", initial: [msg(1, false)] });
    await own.c.start();
    own.c.markRead();
    await vi.advanceTimersByTimeAsync(600);
    expect(own.rpcs.some((r) => r.name === "chat_mark_read")).toBe(false);
    own.c.stop();
  });

  it("does nothing while the tab is hidden", async () => {
    const h = setup({ viewer: "admin", initial: [msg(1, false)], visible: false });
    await h.c.start();
    h.c.markRead();
    await vi.advanceTimersByTimeAsync(600);
    expect(h.rpcs.some((r) => r.name === "chat_mark_read")).toBe(false);
    h.c.stop();
  });
});

describe("cleanup", () => {
  it("removes the channel, timers, auth and visibility listeners on stop", async () => {
    const h = setup({ rows: [[]] });
    await h.c.start();
    await flush();
    expect(h.visListeners()).toBe(1);
    h.c.stop();
    expect(h.removed).toHaveLength(1);
    expect(h.unsubscribed).toHaveBeenCalled();
    expect(h.visListeners()).toBe(0);
    const before = h.queries.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.queries.length).toBe(before);
  });

  it("stop() before the session resolves leaves nothing running", async () => {
    const h = setup();
    const p = h.c.start();
    h.c.stop();
    await p;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.channels).toHaveLength(0);
    expect(h.queries).toHaveLength(0);
  });
});

describe("toMessage", () => {
  it("rejects malformed rows", () => {
    expect(toMessage({ id: "x" }, "user")).toBeNull();
    expect(toMessage(null, "admin")).toBeNull();
  });
});
