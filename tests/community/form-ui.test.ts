import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community/forms-actions", () => ({ submitCommunityRequest: vi.fn() }));

import { CommunityFormSchema } from "@/lib/community/forms";
import { KINDS, buildPayload, contactFields, errorKey, firstInvalid, hashForKind, kindFromHash, nextTabIndex } from "@/lib/community/form-ui";
import { CommunityForm } from "@/components/community/CommunityForm";
import { GetInvolved } from "@/components/sections/GetInvolved";

describe("tabs", () => {
  it("maps hashes both ways", () => {
    expect(kindFromHash("#partner")).toBe("partner");
    expect(kindFromHash("feedback")).toBe("feedback");
    expect(kindFromHash("#nope")).toBeNull();
    expect(kindFromHash("")).toBeNull();
    for (const k of KINDS) expect(kindFromHash(hashForKind(k.kind))).toBe(k.kind);
  });
  it("arrow keys wrap, Home/End jump, other keys are ignored", () => {
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
    expect(nextTabIndex("a", 0, 3)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("contactFields / buildPayload", () => {
  it("anonymous feedback shows and sends no contact fields", () => {
    expect(contactFields("feedback", true)).toEqual([]);
    expect(contactFields("feedback", false)).toContain("email");
    expect(contactFields("partner", true)).toContain("email"); // anonymous only exists on feedback
    const p = buildPayload("feedback", { name: "x", email: "a@b.co", subject: "Subject", message: "A long enough message", category: "other" }, true, "", 1);
    expect(p).not.toHaveProperty("name");
    expect(p).not.toHaveProperty("email");
    expect(CommunityFormSchema.safeParse(p).success).toBe(true);
  });
  it("builds payloads the server schema accepts, for each kind", () => {
    const c = { name: "Asha Rao", email: "a@b.co", phone: "", organisation: "", subject: "A subject", message: "A long enough message" };
    const host = buildPayload("host_event", { ...c, event_title: "Robotics day", expected_attendees: "80", preferred_date: "", venue: "", website: "" }, false, "", 1);
    expect(CommunityFormSchema.safeParse(host).success).toBe(true);
    expect((host.details as Record<string, unknown>).expected_attendees).toBe(80);
    expect(host.details).not.toHaveProperty("preferred_date");
    expect(CommunityFormSchema.safeParse(buildPayload("partner", { ...c, partnership_type: "media", website: "https://example.org" }, false, "", 1)).success).toBe(true);
    expect(CommunityFormSchema.safeParse(buildPayload("feedback", { ...c, category: "complaint" }, false, "", 1)).success).toBe(true);
  });
  it("maps error paths to focus order", () => {
    expect(errorKey("details.event_title")).toBe("event_title");
    expect(firstInvalid(["name", "email", "event_title"], { "details.event_title": "x", email: "y" })).toBe("email");
    expect(firstInvalid(["name"], {})).toBeNull();
  });
});

describe("markup", () => {
  const html = renderToStaticMarkup(createElement(GetInvolved));
  it("renders an accessible tablist with three tabs and panels, and no h1", () => {
    expect(html).toContain('role="tablist"');
    expect((html.match(/role="tab"/g) ?? []).length).toBe(3);
    expect((html.match(/role="tabpanel"/g) ?? []).length).toBe(3);
    expect(html).toContain('id="get-involved"');
    expect(html).not.toContain("<h1");
    expect(html).toMatch(/aria-selected="true"[^>]*>/);
    for (const k of KINDS) expect(html).toContain(k.label.replace("&", "&amp;"));
  });
  it("hides the honeypot from assistive tech and the tab order", () => {
    const out = renderToStaticMarkup(createElement(CommunityForm, { kind: "partner" }));
    const hp = /<div[^>]*aria-hidden="true"[^>]*>.*?<\/div>/.exec(out)?.[0] ?? "";
    expect(hp).toContain('name="company_url"');
    expect(hp).toContain('tabindex="-1"');
    expect(hp).toMatch(/autocomplete="off"/i);
    expect(hp).toContain("left:-9999px");
    expect(out).not.toContain("display:none");
  });
  it("labels required fields and wires the message counter", () => {
    const out = renderToStaticMarkup(createElement(CommunityForm, { kind: "host_event" }));
    expect(out).toContain("Event title");
    expect(out).toContain("0/2000");
    expect(out).toContain('type="submit"');
  });
});
