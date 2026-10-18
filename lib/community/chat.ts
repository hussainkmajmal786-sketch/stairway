import { z } from "zod";

export const CHAT_MAX = 1000;
export const POLL_MS = 20_000;
export type ChatAccess = "member" | "attendee" | "blocked" | "none";

export interface ChatMessage {
  id: number;
  thread_id: string;
  from_admin: boolean;
  body: string;
  created_at: string;
  flagged_at: string | null;
}

/** Dedupe by id (incoming wins), ascending by id; never mutates its inputs. */
export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

const CHAT_COPY: Record<string, string> = {
  not_eligible: "Chat opens for verified IEEE members and for people registered for an upcoming event.",
  blocked: "Chat is not available on your account. Contact the organisers if you think this is a mistake.",
  rate_limited: "You are sending messages too quickly. Wait a few minutes and try again.",
  invalid_body: "Write a message between 1 and 1000 characters, without special control characters.",
  thread_closed: "This conversation is closed. Reopen it by sending a message from the member side.",
  not_found: "We could not find that conversation.",
  unavailable: "Chat is unavailable right now. Please try again in a moment.",
};
export function chatErrorCopy(code: string): string {
  return CHAT_COPY[code] ?? "Something went wrong. Please try again.";
}

export function accessCopy(access: ChatAccess, accessUntil: string | null): string {
  switch (access) {
    case "member":
      return "You can chat with the team because you are a verified IEEE member.";
    case "attendee": {
      const d = accessUntil ? new Date(accessUntil) : null;
      const when =
        d && !Number.isNaN(d.getTime())
          ? ` until ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`
          : "";
      return `You can chat with the team${when}, while you have a confirmed seat at an upcoming event.`;
    }
    case "blocked":
      return "Chat has been turned off for your account.";
    default:
      return "Chat is for verified IEEE members and people with a confirmed seat at an upcoming event.";
  }
}

const CountsSchema = z.object({
  requests_new: z.number().int().min(0),
  chat_unread: z.number().int().min(0),
  claims_pending: z.number().int().min(0),
});

/** Zod-parsed `admin_inbox_counts()` -> badges keyed by nav href. Any malformed value -> no badges. */
export function parseInboxCounts(raw: unknown): Partial<Record<string, number>> {
  const r = CountsSchema.safeParse(raw);
  if (!r.success) return {};
  return {
    "/admin/requests": r.data.requests_new,
    "/admin/chat": r.data.chat_unread,
    "/admin/membership": r.data.claims_pending,
  };
}

/** Ctrl/Cmd+Enter sends; a bare Enter (or Shift+Enter) inserts a newline. */
export function isSendShortcut(e: { key: string; ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return e.key === "Enter" && !!(e.ctrlKey || e.metaKey);
}

export function canSendChat(body: string, sending: boolean): boolean {
  const n = body.trim().length;
  return !sending && n >= 1 && body.length <= CHAT_MAX;
}

/** "5 Jan, 14:05" in IST. */
export function formatChatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

const ChatStateSchema = z.object({
  access: z.enum(["member", "attendee", "blocked", "none"]),
  access_until: z.string().nullish(),
  thread_id: z.string().nullish(),
  status: z.enum(["open", "closed"]).nullish(),
  user_unread: z.number().int().min(0).catch(0),
});
export interface ChatStateView {
  access: ChatAccess;
  accessUntil: string | null;
  threadId: string | null;
  status: "open" | "closed" | null;
  userUnread: number;
}
/** Zod-parsed `chat_state()`; junk -> no access (fails closed). */
export function parseChatState(raw: unknown): ChatStateView {
  const r = ChatStateSchema.safeParse(raw);
  if (!r.success) return { access: "none", accessUntil: null, threadId: null, status: null, userUnread: 0 };
  return { access: r.data.access, accessUntil: r.data.access_until ?? null, threadId: r.data.thread_id ?? null, status: r.data.status ?? null, userUnread: r.data.user_unread };
}

const ThreadRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  handle: z.string(),
  full_name: z.string(),
  status: z.enum(["open", "closed"]),
  admin_unread: z.number().int().min(0),
  last_message_at: z.string(),
  blocked: z.boolean(),
});
export type ThreadRow = z.infer<typeof ThreadRowSchema>;
export function parseThreads(raw: unknown): { total: number; rows: ThreadRow[] } {
  const r = z.object({ total: z.number().int().min(0), rows: z.array(z.unknown()) }).safeParse(raw);
  if (!r.success) return { total: 0, rows: [] };
  const rows = r.data.rows.map((x) => ThreadRowSchema.safeParse(x)).flatMap((x) => (x.success ? [x.data] : []));
  return { total: r.data.total, rows };
}
