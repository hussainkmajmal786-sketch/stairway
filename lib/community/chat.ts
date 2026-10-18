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
