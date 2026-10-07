import { describe, expect, it } from "vitest";
import type { EventView } from "@/lib/events/types";
import { legacyRegisterTarget } from "@/lib/registration/legacy";
import { isExternalHref } from "@/lib/registration/external";
import { openSlug, registerHref, SESSIONS_HREF } from "@/lib/weekends";

const ev = (slug: string, start: string, end: string, p: Partial<EventView> = {}): EventView => ({
  id: slug, slug, step: 1, title: slug, topic: "", summary: "", description: "", start, end, venue: "", mode: "offline",
  posterUrl: null, videoUrl: null, level: "Beginner", formats: [], agenda: [], outcomes: [], prerequisites: [], bring: [],
  seatsTotal: 10, seatsFilled: 3, pricePaise: 0, ticketType: "qr", tokenPrefix: "", isFinale: false, speakerIds: [],
  registrationOpensAt: null, registrationClosesAt: null,
  resources: {}, winners: [], trackName: null,
  society: { id: "main", slug: "main", name: "main", shortName: "main", color: "yellow" },
  ...p,
});

const ONSITE = { mode: "onsite" as const, googleFormUrl: "https://forms.gle/abc123" };
const EXTERNAL = { ...ONSITE, mode: "external" as const };
const NOW = Date.parse("2026-10-07T12:00:00+05:30");
const past = ev("past-step", "2026-09-01T09:00:00+05:30", "2026-09-01T16:00:00+05:30");
const soon = ev("seeing-machines", "2026-10-10T09:30:00+05:30", "2026-10-10T16:00:00+05:30");

describe("registerHref", () => {
  it("links a session to its own register page", () => {
    expect(registerHref("seeing-machines")).toBe("/events/seeing-machines/register");
    expect(registerHref("seeing-machines", ONSITE)).toBe("/events/seeing-machines/register");
  });
  it("percent-encodes the slug", () => expect(registerHref("a/../b?x")).toBe("/events/a%2F..%2Fb%3Fx/register"));
  it("falls back to the session list without a session", () => {
    expect(registerHref()).toBe(SESSIONS_HREF);
    expect(registerHref(null, ONSITE)).toBe("/#societies");
  });
  it("sends every Register link to the https form in external mode", () => {
    expect(registerHref("seeing-machines", EXTERNAL)).toBe("https://forms.gle/abc123");
    expect(registerHref(null, EXTERNAL)).toBe("https://forms.gle/abc123");
  });
  it("never uses an unsafe or placeholder form URL", () => {
    expect(registerHref("x", { ...EXTERNAL, googleFormUrl: "javascript:alert(1)" })).toBe("/events/x/register");
    expect(registerHref("x", { ...EXTERNAL, googleFormUrl: "https://forms.gle/your-form-id" })).toBe("/events/x/register");
  });
});

describe("openSlug", () => {
  it("is the slug of a session that has not ended", () => {
    expect(openSlug({ slug: "a", status: "next" })).toBe("a");
    expect(openSlug({ slug: "a", status: "upcoming" })).toBe("a");
  });
  it("is null for completed sessions or none", () => {
    expect(openSlug({ slug: "a", status: "completed" })).toBeNull();
    expect(openSlug(null)).toBeNull();
    expect(openSlug(undefined)).toBeNull();
  });
});

describe("legacyRegisterTarget", () => {
  const base = { step: null, events: [past, soon], registration: ONSITE, now: NOW };
  it("sends /register to the next open session's register page", () =>
    expect(legacyRegisterTarget(base)).toBe("/events/seeing-machines/register"));
  it("honours ?step=<slug> for a published session", () =>
    expect(legacyRegisterTarget({ ...base, step: "seeing-machines" })).toBe("/events/seeing-machines/register"));
  it("sends a finished session to its event page", () =>
    expect(legacyRegisterTarget({ ...base, step: "past-step" })).toBe("/events/past-step"));
  it("ignores unknown or hostile step values", () => {
    expect(legacyRegisterTarget({ ...base, step: "nope" })).toBe("/events/seeing-machines/register");
    expect(legacyRegisterTarget({ ...base, step: "//evil.example" })).toBe("/events/seeing-machines/register");
  });
  it("falls back to the session list when nothing is open", () => {
    expect(legacyRegisterTarget({ ...base, events: [past] })).toBe("/#societies");
    expect(legacyRegisterTarget({ ...base, events: [] })).toBe("/#societies");
  });
  it("uses the external form in external mode", () =>
    expect(legacyRegisterTarget({ ...base, step: "past-step", registration: EXTERNAL })).toBe("https://forms.gle/abc123"));
});

describe("isExternalHref", () => {
  it("is true only for absolute http(s) URLs, so external Register links open in a new tab everywhere", () => {
    expect(isExternalHref(registerHref("x", EXTERNAL))).toBe(true);
    expect(isExternalHref(registerHref(null, EXTERNAL))).toBe(true);
    expect(isExternalHref("HTTPS://forms.gle/abc")).toBe(true);
    expect(isExternalHref(registerHref("x", ONSITE))).toBe(false);
    expect(isExternalHref("/events/x/register")).toBe(false);
    expect(isExternalHref("/#societies")).toBe(false);
    expect(isExternalHref("//evil.example/x")).toBe(false);
  });
});
