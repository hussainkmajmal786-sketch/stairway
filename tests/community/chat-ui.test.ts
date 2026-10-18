import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community/chat-actions", () => ({ flagMessage: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: vi.fn() }));

import { AccessNotice } from "@/components/chat/AccessNotice";
import { Composer } from "@/components/chat/Composer";
import { MessageList } from "@/components/chat/MessageList";
import { canSendChat, isSendShortcut, parseChatState, parseThreads, type ChatMessage } from "@/lib/community/chat";

const T = "11111111-1111-4111-8111-111111111111";
const m = (id: number, from_admin: boolean, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, thread_id: T, from_admin, body: `body ${id} <b>x</b>`, created_at: "2027-01-05T08:35:00Z", flagged_at: null, ...extra,
});

describe("MessageList", () => {
  const html = renderToStaticMarkup(createElement(MessageList, { messages: [m(1, false), m(2, true)], viewer: "user" }));
  it("is a polite log region", () => {
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-relevant="additions"');
  });
  it("labels own and team messages with words, in IST, and escapes the text", () => {
    expect(html).toContain("You");
    expect(html).toContain("st(AI)rway team");
    expect(html).toContain("14:05"); // 08:35Z -> 14:05 IST
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
  });
  it("keeps ink text on cream/tint, never on cobalt", () => {
    expect(html).not.toMatch(/bg-field|text-paper/);
    expect(html).toMatch(/bg-yellow/);
  });
  it("admin view labels members, shows flags and offers the flag action only on unflagged member messages", () => {
    const out = renderToStaticMarkup(createElement(MessageList, {
      messages: [m(1, false), m(2, false, { flagged_at: "2027-01-06T00:00:00Z" }), m(3, true)], viewer: "admin",
      renderAction: () => createElement("button", null, "FLAGME"),
    }));
    expect(out).toContain("Member");
    expect((out.match(/FLAGME/g) ?? []).length).toBe(1);
    expect(out).toContain("Flagged");
  });
  it("shows an empty state", () => {
    expect(renderToStaticMarkup(createElement(MessageList, { messages: [], viewer: "user" }))).toContain("No messages yet");
  });
});

describe("Composer", () => {
  const html = renderToStaticMarkup(createElement(Composer, { onSend: async () => ({ ok: true as const }) }));
  it("has a labelled textarea, a counter, a 1000 limit and a send button disabled while empty", () => {
    expect(html).toContain("<label");
    expect(html).toContain("0/1000");
    expect(html).toMatch(/maxlength="1000"/i);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });
  it("key handling: Ctrl/Cmd+Enter sends, bare Enter does not", () => {
    expect(isSendShortcut({ key: "Enter", ctrlKey: true })).toBe(true);
    expect(isSendShortcut({ key: "Enter", metaKey: true })).toBe(true);
    expect(isSendShortcut({ key: "Enter" })).toBe(false);
    expect(isSendShortcut({ key: "a", ctrlKey: true })).toBe(false);
  });
  it("send limits", () => {
    expect(canSendChat("", false)).toBe(false);
    expect(canSendChat("   ", false)).toBe(false);
    expect(canSendChat("hi", true)).toBe(false);
    expect(canSendChat("hi", false)).toBe(true);
    expect(canSendChat("x".repeat(1000), false)).toBe(true);
    expect(canSendChat("x".repeat(1001), false)).toBe(false);
  });
});

describe("AccessNotice", () => {
  it("renders blocked / none / ended notices without any composer", () => {
    for (const access of ["blocked", "none", "ended"] as const) {
      const out = renderToStaticMarkup(createElement(AccessNotice, { access }));
      expect(out).toContain('role="status"');
      expect(out).not.toContain("<textarea");
    }
    expect(renderToStaticMarkup(createElement(AccessNotice, { access: "blocked" }))).toContain("unavailable on this account");
    expect(renderToStaticMarkup(createElement(AccessNotice, { access: "ended" }))).toContain("Chat access has ended");
    expect(renderToStaticMarkup(createElement(AccessNotice, { access: "none" }))).toContain("/events");
  });
});

describe("parsers", () => {
  it("parseChatState fails closed", () => {
    expect(parseChatState("junk").access).toBe("none");
    expect(parseChatState({ access: "root" }).access).toBe("none");
    expect(parseChatState({ access: "attendee", access_until: "2027-01-05T12:00:00Z", thread_id: T, status: "closed", user_unread: 3 })).toEqual({
      access: "attendee", accessUntil: "2027-01-05T12:00:00Z", threadId: T, status: "closed", userUnread: 3,
    });
  });
  it("parseThreads drops malformed rows", () => {
    const row = { id: T, user_id: T, handle: "a", full_name: "A B", status: "open", admin_unread: 2, last_message_at: "2027-01-01T00:00:00Z", blocked: false };
    expect(parseThreads({ total: 2, rows: [row, { nope: 1 }] })).toEqual({ total: 2, rows: [row] });
    expect(parseThreads(null)).toEqual({ total: 0, rows: [] });
  });
});

describe("transport", () => {
  it("never routes sends or reads through the Worker (no server actions in the hook, controller or composer)", () => {
    for (const f of ["components/chat/useChatThread.ts", "lib/community/chat-thread.ts", "components/chat/Composer.tsx", "components/chat/MessageList.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/chat-actions|use server|fetch\(/);
    }
    expect(readFileSync("lib/community/chat-thread.ts", "utf8")).toContain('"chat_send"');
  });
});
