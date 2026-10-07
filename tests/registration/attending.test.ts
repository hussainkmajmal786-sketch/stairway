import { describe, expect, it } from "vitest";
import { ATTENDEES_SHOWN, attendingView, profileHref, rowToAttendee } from "@/lib/registration/attending";
import type { Attendee } from "@/lib/registration/types";

const SB = "https://abc.supabase.co";
const person = (i: number): Attendee => ({ handle: `user${String(i).padStart(3, "0")}`, fullName: `User ${i}`, avatarUrl: undefined, headline: "" });

describe("profileHref", () => {
  it("links valid handles to their profile", () => {
    expect(profileHref("asha")).toBe("/u/asha");
    expect(profileHref("a_b-c9")).toBe("/u/a_b-c9");
  });
  it("refuses hostile or invalid handles instead of building a link", () => {
    for (const h of [
      "../admin", "a/b/c", "abc?x=1", "abc#frag", "//evil.com", "javascript:alert(1)", "%2e%2e", "ab", "-abc", "ABC",
      "abc def", "x".repeat(31), "", null, undefined, 42,
    ])
      expect(profileHref(h)).toBeNull();
  });
});

describe("rowToAttendee", () => {
  it("copies only the public fields, trimmed", () => {
    const row = {
      handle: "asha", full_name: "  Asha K ", avatar_url: `${SB}/storage/v1/object/public/avatars/a.png`, headline: " ML student ",
      // Anything else a future view column might add must never pass through.
      email: "asha@example.com", user_id: "11111111-1111-4111-8111-111111111111", ticket_code: "SECRET", phone: "9999",
    };
    const a = rowToAttendee(row, SB);
    expect(a).toEqual({ handle: "asha", fullName: "Asha K", avatarUrl: `${SB}/storage/v1/object/public/avatars/a.png`, headline: "ML student" });
    expect(Object.keys(a!).sort()).toEqual(["avatarUrl", "fullName", "handle", "headline"]);
    const json = JSON.stringify(a);
    for (const secret of ["asha@example.com", "SECRET", "9999", "1111"]) expect(json).not.toContain(secret);
  });
  it("drops rows whose handle cannot be linked", () => {
    for (const handle of [null, "", "../x", "a/b", "Bad Handle"])
      expect(rowToAttendee({ handle, full_name: "X", avatar_url: null, headline: null }, SB)).toBeNull();
  });
  it("only keeps avatars from allowed https hosts", () => {
    const at = (avatar_url: string | null) => rowToAttendee({ handle: "asha", full_name: null, avatar_url, headline: null }, SB)!.avatarUrl;
    expect(at("https://lh3.googleusercontent.com/a/x")).toBe("https://lh3.googleusercontent.com/a/x");
    for (const u of ["https://evil.example/p.png", "http://abc.supabase.co/x.png", "javascript:alert(1)", "data:image/png;base64,AA", null])
      expect(at(u)).toBeUndefined();
  });
  it("tolerates null text fields", () => {
    expect(rowToAttendee({ handle: "asha", full_name: null, avatar_url: null, headline: null }, SB)).toEqual({
      handle: "asha", fullName: "", avatarUrl: undefined, headline: "",
    });
  });
});

describe("attendingView", () => {
  it("caps the list and reports the rest as +N more", () => {
    const list = Array.from({ length: 30 }, (_, i) => person(i));
    const v = attendingView(100, list);
    expect(v.total).toBe(100);
    expect(v.shown).toHaveLength(ATTENDEES_SHOWN);
    expect(v.shown[0]).toBe(list[0]);
    expect(v.more).toBe(100 - ATTENDEES_SHOWN);
  });
  it("counts people without a listed profile in +N more", () => {
    expect(attendingView(5, [person(1), person(2)])).toMatchObject({ total: 5, more: 3 });
  });
  it("never shows a count below the names it lists", () => {
    expect(attendingView(1, [person(1), person(2), person(3)])).toMatchObject({ total: 3, more: 0 });
  });
  it("shows only the count when there is no list (signed out or failed read)", () => {
    expect(attendingView(7, null)).toEqual({ total: 7, shown: [], more: 0 });
  });
  it("handles empty events and junk counts", () => {
    expect(attendingView(0, [])).toEqual({ total: 0, shown: [], more: 0 });
    expect(attendingView(-3, null).total).toBe(0);
    expect(attendingView(Number.NaN, null).total).toBe(0);
    expect(attendingView(2.7, null).total).toBe(2);
  });
});
