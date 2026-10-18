import { z } from "zod";
import { CHAT_MAX, POLL_MS, mergeMessages, type ChatAccess, type ChatMessage } from "./chat";

// Framework-free controller behind `useChatThread`. Everything the hook does (Realtime subscription, the 20 s polling
// backstop, visibility handling, dedupe, rate-limited sends, cleanup) lives here so it can be tested without a DOM.
// Traffic goes browser <-> Supabase only; nothing here touches the Worker.

type Res = { data: unknown; error: { message?: string | null } | null };
export type Q = PromiseLike<Res> & {
  select(cols: string): Q;
  eq(col: string, v: unknown): Q;
  gt(col: string, v: unknown): Q;
  order(col: string, o?: { ascending: boolean }): Q;
  limit(n: number): Q;
};
export interface RtChannel {
  on(type: "postgres_changes", filter: { event: string; schema: string; table: string; filter?: string }, cb: (payload: { new?: unknown }) => void): RtChannel;
  subscribe(cb: (status: string) => void): RtChannel;
}
export interface ChatClient {
  auth: {
    getSession(): PromiseLike<{ data: { session: { access_token: string } | null } }>;
    onAuthStateChange(cb: (event: string, session: { access_token: string } | null) => void): { data: { subscription: { unsubscribe(): void } } };
  };
  realtime: { setAuth(token: string): unknown };
  channel(name: string): RtChannel;
  removeChannel(ch: RtChannel): unknown;
  from(table: string): { select(cols: string): Q };
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<Res>;
}

export type ChatStatus = "live" | "polling" | "offline";
export type ThreadStatus = "open" | "closed";
export interface ChatSnapshot {
  messages: ChatMessage[];
  status: ChatStatus;
  threadId: string | null;
  /** From chat_state() on every user poll; null until known. Admins are always "member"-equivalent here. */
  access: ChatAccess | null;
  threadStatus: ThreadStatus | null;
}
export type SendResult = { ok: true } | { ok: false; code: string };

// Columns the BROWSER may select. `flagged_at` and `sender_id` are staff-only: never requested for users.
export const USER_COLS = "id, thread_id, from_admin, body, created_at";
export const ADMIN_COLS = "id, thread_id, from_admin, body, created_at, flagged_at";

const RowSchema = z.object({
  id: z.number().int(),
  thread_id: z.string(),
  from_admin: z.boolean(),
  body: z.string(),
  created_at: z.string(),
  flagged_at: z.string().nullish(),
});

/** Any row (Realtime payloads carry every column) -> the safe message shape. Users never get `flagged_at`. */
export function toMessage(raw: unknown, viewer: "user" | "admin"): ChatMessage | null {
  const r = RowSchema.safeParse(raw);
  if (!r.success) return null;
  const d = r.data;
  return {
    id: d.id,
    thread_id: d.thread_id,
    from_admin: d.from_admin,
    body: d.body,
    created_at: d.created_at,
    flagged_at: viewer === "admin" ? (d.flagged_at ?? null) : null,
  };
}

const SEND_CODES = ["not_eligible", "blocked", "rate_limited", "invalid_body", "thread_closed", "not_found"] as const;
/** RPC error -> one of our codes (never raw database text). */
export function sendErrorCode(e: { message?: string | null } | null): string {
  const m = (e?.message ?? "").trim().toLowerCase();
  if ((SEND_CODES as readonly string[]).includes(m)) return m;
  if (/fetch failed|network|timeout|failed to fetch|econn/.test(m)) return "unavailable";
  return "unknown";
}

const StateSchema = z.object({
  access: z.enum(["member", "attendee", "blocked", "none"]),
  thread_id: z.string().nullish(),
  status: z.enum(["open", "closed"]).nullish(),
});

const PAGE = 100;
const MAX_PAGES = 5;
const MARK_DEBOUNCE_MS = 500;

export interface ControllerOpts {
  /** A client, or a factory resolved on first use (so rendering on the server never builds one). */
  client: ChatClient | (() => ChatClient);
  threadId: string | null;
  initial: ChatMessage[];
  viewer: "user" | "admin";
  isVisible: () => boolean;
  /** Registers a visibility listener; returns its remover. */
  onVisibility: (cb: () => void) => () => void;
  pollMs?: number;
}

export class ChatThreadController {
  private snap: ChatSnapshot;
  private listeners = new Set<() => void>();
  private channel: RtChannel | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private markTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubAuth: (() => void) | null = null;
  private unsubVis: (() => void) | null = null;
  private stopped = true;
  private polling = false;
  private lastMarked = 0;
  private realtimeUp = false;
  private offline = false;
  private resolved: ChatClient | null = null;
  private get client(): ChatClient {
    if (!this.resolved) this.resolved = typeof this.o.client === "function" ? this.o.client() : this.o.client;
    return this.resolved;
  }

  constructor(private readonly o: ControllerOpts) {
    const messages = mergeMessages([], o.initial.map((m) => toMessage(m, o.viewer)).filter((m): m is ChatMessage => m !== null));
    this.snap = { messages, status: "polling", threadId: o.threadId, access: null, threadStatus: null };
  }

  // useSyncExternalStore contract: a stable snapshot object that changes identity only on change.
  getSnapshot = (): ChatSnapshot => this.snap;
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<ChatSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }
  private recomputeStatus() {
    const status: ChatStatus = this.offline ? "offline" : this.realtimeUp ? "live" : "polling";
    if (status !== this.snap.status) this.set({ status });
  }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    const client = this.client;
    try {
      const { data } = await client.auth.getSession();
      if (this.stopped) return;
      if (data.session) client.realtime.setAuth(data.session.access_token);
      const sub = client.auth.onAuthStateChange((event, session) => {
        if (event === "TOKEN_REFRESHED" && session) client.realtime.setAuth(session.access_token);
      });
      this.unsubAuth = () => sub.data.subscription.unsubscribe();
    } catch {
      // no session: RLS returns nothing and the poll surfaces the state
    }
    if (this.stopped) {
      this.cleanup();
      return;
    }
    this.subscribeRealtime();
    this.unsubVis = this.o.onVisibility(() => {
      if (this.o.isVisible()) void this.poll();
    });
    this.timer = setInterval(() => {
      if (this.o.isVisible()) void this.poll();
    }, this.o.pollMs ?? POLL_MS);
    void this.poll();
  }

  stop(): void {
    this.stopped = true;
    this.cleanup();
  }

  private cleanup() {
    if (this.timer) clearInterval(this.timer);
    if (this.markTimer) clearTimeout(this.markTimer);
    this.timer = null;
    this.markTimer = null;
    this.unsubVis?.();
    this.unsubAuth?.();
    this.unsubVis = null;
    this.unsubAuth = null;
    if (this.channel) {
      try {
        this.client.removeChannel(this.channel);
      } catch {
        // nothing to do
      }
      this.channel = null;
    }
    this.realtimeUp = false;
  }

  private subscribeRealtime() {
    const id = this.snap.threadId;
    if (!id || this.channel || this.stopped) return;
    try {
      this.channel = this.client
        .channel(`chat:${id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${id}` }, (p) => {
          const m = toMessage(p.new, this.o.viewer);
          if (m && m.thread_id === id) this.merge([m]);
        })
        .subscribe((status) => {
          if (this.stopped) return;
          this.realtimeUp = status === "SUBSCRIBED";
          this.recomputeStatus();
        });
    } catch {
      this.realtimeUp = false;
      this.recomputeStatus();
    }
  }

  private merge(incoming: ChatMessage[]) {
    if (incoming.length === 0) return;
    const messages = mergeMessages(this.snap.messages, incoming);
    if (messages.length !== this.snap.messages.length || incoming.some((m) => this.snap.messages.find((x) => x.id === m.id)?.flagged_at !== m.flagged_at)) {
      this.set({ messages });
    }
  }

  /** One catch-up pass: learn the thread (users), pull messages newer than the last one we hold, refresh access state. */
  async poll(): Promise<void> {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      const { viewer } = this.o;
      const client = this.client;
      if (viewer === "user") await this.refreshState();
      if (!this.snap.threadId && viewer === "user") await this.discoverThread();
      const id = this.snap.threadId;
      if (id) {
        this.subscribeRealtime();
        const cols = viewer === "admin" ? ADMIN_COLS : USER_COLS;
        for (let i = 0; i < MAX_PAGES; i++) {
          const last = this.snap.messages.reduce((a, m) => Math.max(a, m.id), 0);
          const { data, error } = await client.from("chat_messages").select(cols).eq("thread_id", id).gt("id", last).order("id", { ascending: true }).limit(PAGE);
          if (this.stopped) return;
          if (error || !Array.isArray(data)) {
            this.offline = true;
            this.recomputeStatus();
            return;
          }
          const msgs = data.map((r) => toMessage(r, viewer)).filter((m): m is ChatMessage => m !== null);
          this.merge(msgs);
          if (data.length < PAGE) break;
        }
      }
      this.offline = false;
      this.recomputeStatus();
    } catch {
      this.offline = true;
      this.recomputeStatus();
    } finally {
      this.polling = false;
    }
  }

  private async refreshState() {
    const { data, error } = await this.client.rpc("chat_state");
    if (error) return;
    const s = StateSchema.safeParse(data);
    if (!s.success) return;
    const patch: Partial<ChatSnapshot> = { access: s.data.access, threadStatus: s.data.status ?? null };
    if (s.data.thread_id && !this.snap.threadId) patch.threadId = s.data.thread_id;
    if (patch.access !== this.snap.access || patch.threadStatus !== this.snap.threadStatus || patch.threadId) this.set(patch);
  }

  private async discoverThread() {
    const { data } = await this.client.from("chat_threads").select("id").limit(1);
    const first = Array.isArray(data) ? (data[0] as { id?: unknown } | undefined) : undefined;
    if (first && typeof first.id === "string") this.set({ threadId: first.id });
  }

  async send(body: string): Promise<SendResult> {
    const text = body.trim();
    if (text.length < 1 || text.length > CHAT_MAX) return { ok: false, code: "invalid_body" };
    const { viewer } = this.o;
    const { data, error } = await this.client.rpc("chat_send", {
      p_thread_id: viewer === "admin" ? this.snap.threadId : null,
      p_body: text,
    });
    if (error || data === null || typeof data !== "object") {
      const code = sendErrorCode(error);
      if (code === "not_eligible") this.set({ access: "none" });
      if (code === "blocked") this.set({ access: "blocked" });
      return { ok: false, code };
    }
    this.set({ threadStatus: "open" });
    // Pull the new row straight away through RLS; the Realtime event / next poll dedupes by id.
    void this.poll();
    return { ok: true };
  }

  /** Debounced; only when visible, there is a thread, and the newest message is from the other side. */
  markRead(): void {
    if (this.stopped || !this.snap.threadId || !this.o.isVisible()) return;
    const last = this.snap.messages[this.snap.messages.length - 1];
    if (!last || last.id <= this.lastMarked) return;
    const fromOther = this.o.viewer === "user" ? last.from_admin : !last.from_admin;
    if (!fromOther) return;
    if (this.markTimer) clearTimeout(this.markTimer);
    this.markTimer = setTimeout(() => {
      this.markTimer = null;
      const id = this.snap.threadId;
      const newest = this.snap.messages[this.snap.messages.length - 1];
      if (this.stopped || !id || !newest) return;
      this.lastMarked = newest.id;
      void this.client.rpc("chat_mark_read", { p_thread_id: id });
    }, MARK_DEBOUNCE_MS);
  }
}
