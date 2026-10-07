import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttendingPanel, type AttendingProps } from "@/components/registration/AttendingPanel";
import type { Attendee } from "@/lib/registration/types";

const base: AttendingProps = { count: 0, signedIn: false, attendees: null, signInHref: "/login?next=%2Fevents%2Fx", ended: false };
const html = (p: Partial<AttendingProps>) => renderToStaticMarkup(createElement(AttendingPanel, { ...base, ...p }));
const asha: Attendee = { handle: "asha", fullName: "Asha K", avatarUrl: undefined, headline: "ML student" };

describe("AttendingPanel", () => {
  it("signed out: count and sign-in link only, no names or profile links even if a list is passed", () => {
    const out = html({ count: 5, attendees: [asha] });
    expect(out).toContain('aria-labelledby="attending-h"');
    expect(out).toMatch(/5(<!-- -->)? <span[^>]*>attending/);
    expect(out).toContain('href="/login?next=%2Fevents%2Fx"');
    expect(out).toContain("Sign in to see who");
    expect(out).not.toContain("/u/");
    expect(out).not.toContain("Asha");
  });

  it("empty event: invites the first registration", () => {
    expect(html({})).toContain("Be the first to register");
    expect(html({ signedIn: true, attendees: [] })).toContain("Be the first to register");
    expect(html({ ended: true })).not.toContain("Be the first");
  });

  it("signed in: a list of named profile links, with +N more for the rest", () => {
    const out = html({ signedIn: true, count: 3, attendees: [asha] });
    expect(out).toContain("<ul");
    expect(out).toContain('href="/u/asha"');
    expect(out).toContain("Asha K");
    expect(out).toContain("ML student");
    expect(out).toContain("+2 more");
  });

  it("signed in but the read failed: the count plus a quiet notice", () => {
    const out = html({ signedIn: true, count: 4, attendees: null });
    expect(out).toContain("couldn&#x27;t load the list");
    expect(out).not.toContain("<ul");
  });
});
