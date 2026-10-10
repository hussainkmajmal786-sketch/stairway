import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rowToTicket, toSummary, type TicketRow, type TicketSummary } from "@/lib/registration/tickets";
import { nextStep, passLabel, statusLabel, ticketGroups, ticketListRow } from "@/lib/tickets/list";
import { isNavActive } from "@/lib/dashboard/nav";
import { TicketListItem } from "@/components/tickets/TicketListItem";
import { NextTicketCard } from "@/components/tickets/NextTicketCard";

const CODE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ID = "0b7c3f1e-2a4d-4e5f-8a9b-1c2d3e4f5a6b";
const row: TicketRow = {
  id: ID, status: "confirmed", waitlist_position: null, ticket_code: CODE, token_number: 7, checked_in_at: null,
  event: {
    id: "e1", slug: "seeing-machines", title: "Seeing Machines", topic: "CV", step_number: 1,
    starts_at: "2026-10-10T04:00:00+00:00", ends_at: "2026-10-10T11:00:00+00:00", price_paise: 0,
    ticket_type: "token", token_prefix: "RAS-01", society: { short_name: "RAS", color: "green" },
  },
};
const summary = (r: Partial<TicketRow> = {}): TicketSummary => toSummary(rowToTicket({ ...row, ...r })!);
const mk = (id: string, status: TicketSummary["status"], start: string, end: string): TicketSummary => {
  const b = summary({ status, waitlist_position: status === "waitlisted" ? 3 : null });
  return { ...b, id, event: { ...b.event, start, end } };
};
const NOW = Date.parse("2026-10-07T00:00:00Z");

describe("statusLabel", () => {
  it("labels every status with text (colour never stands alone)", () => {
    expect(statusLabel("confirmed", null)).toEqual({ label: "Confirmed", tone: "green" });
    expect(statusLabel("waitlisted", 4)).toEqual({ label: "Waitlist #4", tone: "yellow" });
    expect(statusLabel("waitlisted", null).label).toBe("Waitlisted");
    expect(statusLabel("pending_payment", null).label).toBe("Payment pending");
    expect(statusLabel("cancelled", null)).toEqual({ label: "Cancelled", tone: "outline" });
    expect(statusLabel("refunded", null).label).toBe("Refunded");
    expect(statusLabel("refund_needed", null)).toEqual({ label: "Refund pending", tone: "orange" });
    expect(statusLabel("refunded", null)).toEqual({ label: "Refunded", tone: "outline" });
  });
});

describe("passLabel", () => {
  it("names the token only for a confirmed seat", () => {
    expect(passLabel({ status: "confirmed", ticketType: "token", token: "RAS-01-0007" })).toBe("Token RAS-01-0007");
    expect(passLabel({ status: "waitlisted", ticketType: "token", token: "RAS-01-0007" })).toBe("Token pass once confirmed");
    expect(passLabel({ status: "pending_payment", ticketType: "qr", token: null })).toBe("QR pass once confirmed");
  });
  it("falls back to a QR pass when a confirmed token seat has no number", () => {
    expect(passLabel({ status: "confirmed", ticketType: "token", token: null })).toBe("QR pass");
    expect(passLabel({ status: "confirmed", ticketType: "qr", token: "RAS-01-0007" })).toBe("QR pass");
  });
});

describe("ticketListRow", () => {
  it("links to the ticket and shows IST date and time", () => {
    const r = ticketListRow(summary());
    expect(r.href).toBe(`/me/tickets/${ID}`);
    expect(r.eyebrow).toBe("RAS · Step 01");
    expect(r.when).toMatch(/^Sat, 10 Oct, 9:30\sam IST$/i);
    expect(r.status.label).toBe("Confirmed");
    expect(r.pass).toBe("Token RAS-01-0007");
  });
  it("never carries the ticket code, nor a waitlisted row's old token", () => {
    expect(JSON.stringify(ticketListRow(summary()))).not.toContain(CODE);
    const w = ticketListRow(summary({ status: "waitlisted", waitlist_position: 2, token_number: 7 }));
    expect(JSON.stringify(w)).not.toContain("0007");
    expect(w.status.label).toBe("Waitlist #2");
  });
  it("renders without the code or a waitlisted token", () => {
    const html = renderToStaticMarkup(
      createElement(TicketListItem, { row: ticketListRow(summary({ status: "waitlisted", waitlist_position: 2 })) }),
    );
    expect(html).toContain(`href="/me/tickets/${ID}"`);
    expect(html).toContain("Waitlist #2");
    expect(html).not.toContain(CODE);
    expect(html).not.toContain("RAS-01-0007");
  });
});

describe("ticketGroups", () => {
  it("splits into upcoming (soonest first) and past (latest first)", () => {
    const list = [
      mk("later", "confirmed", "2026-11-01T04:00:00Z", "2026-11-01T11:00:00Z"),
      mk("old", "confirmed", "2026-08-01T04:00:00Z", "2026-08-01T11:00:00Z"),
      mk("soon", "waitlisted", "2026-10-10T04:00:00Z", "2026-10-10T11:00:00Z"),
      mk("recent", "confirmed", "2026-09-01T04:00:00Z", "2026-09-01T11:00:00Z"),
    ];
    const { upcoming, past } = ticketGroups(list, NOW);
    expect(upcoming.map((r) => r.id)).toEqual(["soon", "later"]);
    expect(past.map((r) => r.id)).toEqual(["recent", "old"]);
  });
  it("is empty for no tickets", () => expect(ticketGroups([], NOW)).toEqual({ upcoming: [], past: [] }));
});

describe("nextStep", () => {
  it("prefers the soonest confirmed seat over an earlier waitlist place", () => {
    const n = nextStep([
      mk("w", "waitlisted", "2026-10-10T04:00:00Z", "2026-10-10T11:00:00Z"),
      mk("c", "confirmed", "2026-11-01T04:00:00Z", "2026-11-01T11:00:00Z"),
    ], NOW)!;
    expect(n.href).toBe("/me/tickets/c");
    expect(n.waitlisted).toBe(false);
    expect(n.live).toBe(false);
    expect(n.when).toMatch(/IST$/);
  });
  it("falls back to a waitlist place, never to payment-pending or past rows", () => {
    expect(nextStep([mk("p", "pending_payment", "2026-10-10T04:00:00Z", "2026-10-10T11:00:00Z")], NOW)).toBeNull();
    expect(nextStep([mk("old", "confirmed", "2026-08-01T04:00:00Z", "2026-08-01T11:00:00Z")], NOW)).toBeNull();
    const n = nextStep([mk("w", "waitlisted", "2026-10-10T04:00:00Z", "2026-10-10T11:00:00Z")], NOW)!;
    expect(n.waitlisted).toBe(true);
    expect(n.waitlistPosition).toBe(3);
  });
  it("marks a running session as live", () => {
    const n = nextStep([mk("c", "confirmed", "2026-10-06T23:00:00Z", "2026-10-07T05:00:00Z")], NOW)!;
    expect(n.live).toBe(true);
  });
  it("is null with no tickets", () => expect(nextStep([], NOW)).toBeNull());
});

describe("NextTicketCard", () => {
  it("offers the schedule when there is no next step", () => {
    const html = renderToStaticMarkup(createElement(NextTicketCard, { next: null }));
    expect(html).toContain("Your next step");
    expect(html).toContain('href="/#societies"');
  });
  it("says so when tickets could not be loaded", () => {
    const html = renderToStaticMarkup(createElement(NextTicketCard, { next: null, failed: true }));
    expect(html).toContain('href="/me/tickets"');
    expect(html).not.toContain("haven&#x27;t registered");
  });
  it("shows a live session without a countdown", () => {
    const n = nextStep([mk("c", "confirmed", "2026-10-06T23:00:00Z", "2026-10-07T05:00:00Z")], NOW);
    const html = renderToStaticMarkup(createElement(NextTicketCard, { next: n }));
    expect(html).toContain("Happening now");
    expect(html).toContain('href="/me/tickets/c"');
    expect(html).toContain("Open ticket");
  });
});

describe("isNavActive", () => {
  it("keeps My tickets active on a single ticket, Overview only on /me", () => {
    expect(isNavActive("/me/tickets", "/me/tickets")).toBe(true);
    expect(isNavActive(`/me/tickets/${ID}`, "/me/tickets")).toBe(true);
    expect(isNavActive("/me/ticketsx", "/me/tickets")).toBe(false);
    expect(isNavActive("/me/tickets", "/me", true)).toBe(false);
    expect(isNavActive("/me", "/me", true)).toBe(true);
  });
});
