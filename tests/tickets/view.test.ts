import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TicketCard, type TicketCardData } from "@/components/tickets/TicketCard";
import { qrRows } from "@/lib/tickets/qr";
import { qrLayout, wrapText } from "@/lib/tickets/png";
import { cancelBlock, doorPass, QUIET_ZONE, ticketFilename } from "@/lib/tickets/view";

const CODE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NOW = Date.parse("2026-10-07T00:00:00Z");
const future = "2026-10-20T04:30:00Z";
const past = "2026-10-01T04:30:00Z";

describe("doorPass", () => {
  it("gives a pass only to confirmed seats", () => {
    expect(doorPass({ status: "waitlisted", ticketType: "qr", token: null })).toEqual({ kind: "none" });
    expect(doorPass({ status: "pending_payment", ticketType: "qr", token: null })).toEqual({ kind: "none" });
    expect(doorPass({ status: "waitlisted", ticketType: "token", token: "RAS-0001" })).toEqual({ kind: "none" });
    expect(doorPass({ status: "confirmed", ticketType: "qr", token: null })).toEqual({ kind: "qr" });
    expect(doorPass({ status: "confirmed", ticketType: "token", token: "RAS-0001" })).toEqual({
      kind: "token",
      token: "RAS-0001",
    });
  });
  it("falls back to a QR when a token event's seat has no token", () => {
    expect(doorPass({ status: "confirmed", ticketType: "token", token: null })).toEqual({ kind: "qr" });
  });
});

describe("cancelBlock (mirrors cancel_registration)", () => {
  const base = { status: "confirmed" as const, checkedInAt: null, event: { start: future, pricePaise: 0 } };
  it("allows confirmed and waitlisted free registrations before the start", () => {
    expect(cancelBlock(base, NOW)).toBeNull();
    expect(cancelBlock({ ...base, status: "waitlisted" }, NOW)).toBeNull();
  });
  it("refuses checked-in, pending, paid and started", () => {
    expect(cancelBlock({ ...base, checkedInAt: "2026-10-06T00:00:00Z" }, NOW)).toBe("checked_in");
    expect(cancelBlock({ ...base, status: "pending_payment" }, NOW)).toBe("pending_payment");
    expect(cancelBlock({ ...base, event: { start: future, pricePaise: 9900 } }, NOW)).toBe("paid");
    expect(cancelBlock({ ...base, event: { start: past, pricePaise: 0 } }, NOW)).toBe("started");
    expect(cancelBlock({ ...base, event: { start: new Date(NOW).toISOString(), pricePaise: 0 } }, NOW)).toBe("started");
  });
});

describe("ticketFilename", () => {
  it("keeps only safe slug characters", () => {
    expect(ticketFilename("seeing-machines")).toBe("stairway-seeing-machines-ticket.png");
    expect(ticketFilename("../../etc/passwd")).toBe("stairway-etc-passwd-ticket.png");
    expect(ticketFilename("a\\b:c*?\"<>|")).toBe("stairway-a-b-c-ticket.png");
    expect(ticketFilename("")).toBe("stairway-session-ticket.png");
  });
});

describe("PNG layout", () => {
  it("adds a 4-module quiet zone with whole-pixel modules", () => {
    const { cells, px, size } = qrLayout(25, 560);
    expect(cells).toBe(25 + 2 * QUIET_ZONE);
    expect(Number.isInteger(px)).toBe(true);
    expect(size).toBe(px * cells);
    expect(size).toBeLessThanOrEqual(560);
  });
  it("wraps and ellipsises", () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapText(measure, "one two three", 1000, 2)).toEqual(["one two three"]);
    expect(wrapText(measure, "one two three four", 80, 1)).toEqual(["one…"]);
  });
});

describe("TicketCard", () => {
  const card = (over: Partial<TicketCardData>): TicketCardData => ({
    eyebrow: "RAS · Step 01", title: "Seeing Machines", when: "Tue", venue: "Hall", name: "Asha",
    status: "confirmed", waitlistPosition: null, pass: { kind: "qr" }, token: null, qrRows: qrRows(CODE),
    code: CODE, checkedInAt: null, ...over,
  });
  const html = (t: TicketCardData) => renderToStaticMarkup(createElement(TicketCard, { t }));

  it("renders the QR with a quiet zone, crisp edges and a label without the code", () => {
    const n = qrRows(CODE).length;
    const out = html(card({}));
    expect(out).toContain(`viewBox="-4 -4 ${n + 8} ${n + 8}"`);
    expect(out).toContain('shape-rendering="crispEdges"');
    expect(out).toContain('role="img"');
    const label = /aria-label="([^"]*)"/.exec(out)?.[1] ?? "";
    expect(label).not.toContain(CODE);
    expect(out).toContain(CODE); // human-readable fallback beneath
  });

  it("shows a waitlist state with no QR, no token and no code", () => {
    const out = html(card({ status: "waitlisted", waitlistPosition: 3, pass: { kind: "none" }, qrRows: null, code: null }));
    expect(out).not.toContain("<svg");
    expect(out).not.toContain(CODE);
    expect(out).toContain("#3");
    expect(out).toMatch(/not an entry ticket/);
  });

  it("shows a token ticket as big text", () => {
    const out = html(card({ pass: { kind: "token", token: "RAS-01-0042" }, token: "RAS-01-0042", qrRows: null, code: null }));
    expect(out).not.toContain("<svg");
    expect(out).toContain("RAS-01-0042");
  });
});
