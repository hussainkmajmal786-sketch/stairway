import { describe, expect, it } from "vitest";
import { accessCopy, chatErrorCopy, mergeMessages, parseInboxCounts, type ChatMessage } from "@/lib/community/chat";

const m = (id: number, body = "x"): ChatMessage => ({ id, thread_id: "t", from_admin: false, body, created_at: "2026-01-01T00:00:00Z", flagged_at: null });

describe("mergeMessages", () => {
  it("dedupes, sorts ascending and does not mutate", () => {
    const a = [m(3), m(1)];
    const b = [m(2), m(3, "new")];
    const out = mergeMessages(a, b);
    expect(out.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(out[2].body).toBe("new");
    expect(a.map((x) => x.id)).toEqual([3, 1]);
    expect(b).toHaveLength(2);
    expect(out).not.toBe(a);
  });
});
describe("copy", () => {
  it("covers every code", () => {
    for (const c of ["not_eligible", "blocked", "rate_limited", "invalid_body", "thread_closed", "not_found", "unavailable"]) {
      expect(chatErrorCopy(c)).not.toMatch(/Something went wrong/);
    }
    expect(accessCopy("attendee", "2026-12-31T10:00:00Z")).toMatch(/until 31 Dec 2026/);
    expect(accessCopy("member", null)).toMatch(/verified IEEE member/);
    expect(accessCopy("blocked", null)).toMatch(/turned off/);
    expect(accessCopy("none", null)).toMatch(/confirmed seat/);
  });
});
describe("parseInboxCounts", () => {
  it("keys counts by href and fails closed", () => {
    expect(parseInboxCounts({ requests_new: 2, chat_unread: 0, claims_pending: 5 })).toEqual({
      "/admin/requests": 2, "/admin/chat": 0, "/admin/membership": 5,
    });
    expect(parseInboxCounts({ requests_new: "2" })).toEqual({});
    expect(parseInboxCounts(null)).toEqual({});
  });
});
