import { describe, expect, it } from "vitest";
import {
  ctaEvent, ctaState, loginPath, registerPath, registrationWindow, ticketPath,
  type CtaEvent, type CtaInput,
} from "@/lib/registration/cta";

const NOW = Date.parse("2026-10-06T12:00:00+05:30");
const EVENT: CtaEvent = {
  slug: "seeing-machines", start: "2026-10-10T09:30:00+05:30", pricePaise: 0, seatsLeft: 10,
  registrationOpensAt: null, registrationClosesAt: null,
};
const base: CtaInput = { now: NOW, event: EVENT, signedIn: true, registration: null, externalUrl: null };
const at = (p: Partial<CtaInput>, e: Partial<CtaEvent> = {}): CtaInput => ({ ...base, ...p, event: { ...EVENT, ...e } });

describe("ctaState", () => {
  it("offers registration", () =>
    expect(ctaState(base)).toEqual({ kind: "register", href: "/events/seeing-machines/register" }));
  it("offers the waitlist when full", () =>
    expect(ctaState(at({}, { seatsLeft: 0 }))).toEqual({ kind: "join_waitlist", href: "/events/seeing-machines/register" }));
  it("asks signed-out visitors to sign in, returning to the form", () => {
    expect(ctaState(at({ signedIn: false }))).toEqual({
      kind: "sign_in", href: "/login?next=%2Fevents%2Fseeing-machines%2Fregister", full: false,
    });
    expect(ctaState(at({ signedIn: false }, { seatsLeft: 0 }))).toMatchObject({ kind: "sign_in", full: true });
  });
  it("shows the ticket for confirmed and pending registrations, even after the event", () => {
    expect(ctaState(at({ registration: { id: "r1", status: "confirmed", waitlistPosition: null } })))
      .toEqual({ kind: "registered", registrationId: "r1" });
    expect(ctaState(at({ registration: { id: "r1", status: "pending_payment", waitlistPosition: null } })).kind).toBe("registered");
    expect(ctaState(at({ now: Date.parse("2026-12-01T00:00:00Z"), registration: { id: "r1", status: "confirmed", waitlistPosition: null } })).kind)
      .toBe("registered");
  });
  it("shows an existing registration even in external-form mode or for a paid event", () => {
    const registration = { id: "r1", status: "confirmed" as const, waitlistPosition: null };
    expect(ctaState(at({ registration, externalUrl: "https://forms.gle/abc" })).kind).toBe("registered");
    expect(ctaState(at({ registration }, { pricePaise: 9900 })).kind).toBe("registered");
  });
  it("shows the waitlist position", () =>
    expect(ctaState(at({ registration: { id: "r2", status: "waitlisted", waitlistPosition: 3 } })))
      .toEqual({ kind: "waitlisted", registrationId: "r2", position: 3 }));
  it("treats cancelled or refunded registrations as not registered", () => {
    expect(ctaState(at({ registration: { id: "r3", status: "cancelled", waitlistPosition: null } })).kind).toBe("register");
    expect(ctaState(at({ registration: { id: "r3", status: "refunded", waitlistPosition: null } })).kind).toBe("register");
    expect(ctaState(at({ registration: { id: "r3", status: "refund_needed", waitlistPosition: null } })).kind).toBe("register");
  });
  it("closes at the start time or the closing time, whichever is first", () => {
    expect(ctaState(at({ now: Date.parse(EVENT.start) })).kind).toBe("closed");
    expect(ctaState(at({}, { registrationClosesAt: "2026-10-05T00:00:00+05:30" })).kind).toBe("closed");
    expect(ctaState(at({ now: Date.parse(EVENT.start) }, { registrationClosesAt: "2026-10-20T00:00:00+05:30" })).kind).toBe("closed");
    expect(ctaState(at({ signedIn: false, now: Date.parse(EVENT.start) })).kind).toBe("closed");
  });
  it("announces the opening time", () => {
    expect(ctaState(at({}, { registrationOpensAt: "2026-10-08T09:00:00+05:30" })))
      .toEqual({ kind: "opens", opensAt: "2026-10-08T09:00:00+05:30" });
    expect(ctaState(at({ signedIn: false }, { registrationOpensAt: "2026-10-08T09:00:00+05:30", seatsLeft: 0 })).kind)
      .toBe("opens");
  });
  it("uses the external form when configured, unless closed", () => {
    expect(ctaState(at({ externalUrl: "https://forms.gle/abc" }))).toEqual({ kind: "external", href: "https://forms.gle/abc" });
    expect(ctaState(at({ externalUrl: "https://forms.gle/abc", signedIn: false })).kind).toBe("external");
    expect(ctaState(at({ externalUrl: "https://forms.gle/abc", now: Date.parse(EVENT.start) })).kind).toBe("closed");
  });
  it("ignores an unsafe external URL and falls back to on-site registration", () => {
    expect(ctaState(at({ externalUrl: "javascript:alert(1)" })).kind).toBe("register");
    expect(ctaState(at({ externalUrl: "http://forms.gle/abc" })).kind).toBe("register");
  });
  it("defers paid events to Phase 4", () => {
    expect(ctaState(at({}, { pricePaise: 9900 })).kind).toBe("paid_soon");
    expect(ctaState(at({ signedIn: false }, { pricePaise: 9900, seatsLeft: 0 })).kind).toBe("paid_soon");
  });
});

describe("registrationWindow", () => {
  it("matches the database rules", () => {
    expect(registrationWindow(EVENT, NOW)).toBe("open");
    expect(registrationWindow({ ...EVENT, registrationOpensAt: "2026-10-07T00:00:00+05:30" }, NOW)).toBe("not_open");
    expect(registrationWindow({ ...EVENT, registrationOpensAt: "2026-10-06T12:00:00+05:30" }, NOW)).toBe("open");
    expect(registrationWindow(EVENT, Date.parse(EVENT.start) - 1)).toBe("open");
    expect(registrationWindow(EVENT, Date.parse(EVENT.start))).toBe("closed");
    expect(registrationWindow({ ...EVENT, registrationClosesAt: "2026-10-06T12:00:00+05:30" }, NOW)).toBe("closed");
  });
});

describe("ctaEvent", () => {
  const e = {
    slug: "x", start: EVENT.start, pricePaise: 0, seatsTotal: 10, seatsFilled: 12,
    registrationOpensAt: null, registrationClosesAt: null,
  };
  it("derives seats left and never goes negative", () => {
    expect(ctaEvent(e).seatsLeft).toBe(0);
    expect(ctaEvent({ ...e, seatsFilled: 4 }).seatsLeft).toBe(6);
  });
  it("keeps only the CTA fields", () => {
    const row = { ...e, title: "T" }; // a wider event row, as callers pass it
    expect(Object.keys(ctaEvent(row)).sort()).toEqual(
      ["pricePaise", "registrationClosesAt", "registrationOpensAt", "seatsLeft", "slug", "start"],
    );
  });
});

describe("path helpers", () => {
  it("build internal paths and encode untrusted segments", () => {
    expect(registerPath("seeing-machines")).toBe("/events/seeing-machines/register");
    expect(registerPath("a/../b?x")).toBe("/events/a%2F..%2Fb%3Fx/register");
    expect(ticketPath("r1")).toBe("/me/tickets/r1");
    expect(ticketPath("../x")).toBe("/me/tickets/..%2Fx");
    expect(loginPath("/events/x/register")).toBe("/login?next=%2Fevents%2Fx%2Fregister");
  });
});
