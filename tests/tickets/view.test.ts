import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TicketCard, type TicketCardData } from "@/components/tickets/TicketCard";
import { qrRows } from "@/lib/tickets/qr";
import {
  FONT_FALLBACK, PNG_COLORS, fontStack, loadCanvasFonts, qrLayout, setCanvasFont, wrapText,
} from "@/lib/tickets/png";
import { QR_DARK, QR_LIGHT } from "@/lib/tickets/layout";
import { contrastRatio } from "@/lib/design/contrast";
import { TOKENS } from "@/lib/design/tokens";
import { cancelBlock, doorPass, QUIET_ZONE, ticketFilename, ticketHeading, ticketNotice, ticketView } from "@/lib/tickets/view";
import type { TicketDetail } from "@/lib/registration/tickets";
import { analyticsPath, gaBootstrap } from "@/lib/analytics";

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
  const base = { status: "confirmed" as const, checkedInAt: null, event: { start: future } };
  it("allows confirmed (free or paid), waitlisted and held registrations before the start", () => {
    expect(cancelBlock(base, NOW)).toBeNull();
    expect(cancelBlock({ ...base, status: "waitlisted" }, NOW)).toBeNull();
    expect(cancelBlock({ ...base, status: "pending_payment" }, NOW)).toBeNull();
  });
  it("lets a hold be released even after the start, but nothing else", () => {
    expect(cancelBlock({ ...base, status: "pending_payment", event: { start: past } }, NOW)).toBeNull();
    expect(cancelBlock({ ...base, event: { start: past } }, NOW)).toBe("started");
    expect(cancelBlock({ ...base, event: { start: new Date(NOW).toISOString() } }, NOW)).toBe("started");
  });
  it("refuses checked-in and inactive registrations", () => {
    expect(cancelBlock({ ...base, checkedInAt: "2026-10-06T00:00:00Z" }, NOW)).toBe("checked_in");
    for (const status of ["cancelled", "refunded", "refund_needed"] as const) {
      expect(cancelBlock({ ...base, status }, NOW)).toBe("inactive");
    }
  });
});

describe("ticketNotice", () => {
  const t = (over: Record<string, unknown> = {}) => ({
    status: "pending_payment" as const, waitlistPosition: null, holdExpiresAt: future, amountPaise: 19900,
    cancelReason: null, refundedAt: null, event: { pricePaise: 19900 }, ...over,
  });
  it("asks for payment while the hold is live, and says it expired afterwards", () => {
    expect(ticketNotice(t(), NOW)).toEqual({ kind: "pay", holdExpiresAt: future, amountPaise: 19900 });
    expect(ticketNotice(t({ holdExpiresAt: past }), NOW)).toEqual({ kind: "hold_expired" });
    expect(ticketNotice(t({ status: "cancelled", cancelReason: "hold_expired" }), NOW)).toEqual({ kind: "hold_expired" });
    expect(ticketNotice(t({ status: "cancelled", cancelReason: "user" }), NOW)).toEqual({ kind: "cancelled" });
  });
  it("shows 'confirming' right after Checkout succeeded", () => {
    expect(ticketNotice(t(), NOW, true)).toEqual({ kind: "processing" });
    // Hold expiry wins over ?paid=1: a stale marker never hides the expired state (or the Pay path after a re-hold).
    expect(ticketNotice(t({ holdExpiresAt: past }), NOW, true)).toEqual({ kind: "hold_expired" });
    expect(ticketNotice(t({ holdExpiresAt: null }), NOW, true)).toEqual({ kind: "hold_expired" });
    const edge = new Date(NOW).toISOString();
    expect(ticketNotice(t({ holdExpiresAt: edge }), NOW, true)).toEqual({ kind: "hold_expired" });
    expect(ticketNotice(t({ holdExpiresAt: new Date(NOW + 1000).toISOString() }), NOW, true)).toEqual({ kind: "processing" });
    expect(ticketNotice(t({ holdExpiresAt: new Date(NOW + 1000).toISOString() }), NOW, false)).toMatchObject({ kind: "pay" });
  });
  it("explains refunds and the waitlist", () => {
    expect(ticketNotice(t({ status: "refund_needed", cancelReason: "late_payment_no_seat" }), NOW))
      .toEqual({ kind: "refund_needed", amount: "₹199", latePayment: true });
    expect(ticketNotice(t({ status: "refund_needed", cancelReason: "user" }), NOW)).toMatchObject({ latePayment: false });
    expect(ticketNotice(t({ status: "refunded", refundedAt: "2026-10-05T04:30:00Z" }), NOW)).toMatchObject({ kind: "refunded", amount: "₹199" });
    expect(ticketNotice(t({ status: "waitlisted", waitlistPosition: 2 }), NOW)).toEqual({ kind: "waitlisted", position: 2, paid: true });
    expect(ticketNotice(t({ status: "confirmed" }), NOW)).toEqual({ kind: "none" });
  });
});

describe("ticketHeading", () => {
  it("names every state", () => {
    expect(ticketHeading("confirmed")).toBe("Your ticket");
    expect(ticketHeading("waitlisted")).toBe("Your waitlist place");
    expect(ticketHeading("pending_payment")).toBe("Complete your payment");
    expect(ticketHeading("refund_needed")).toBe("Refund pending");
    expect(ticketHeading("refunded")).toBe("Refunded");
    expect(ticketHeading("cancelled")).toBe("Registration cancelled");
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
    code: CODE, checkedInAt: null, notice: { kind: "none" }, receipt: null, ...over,
  });
  const html = (t: TicketCardData) => renderToStaticMarkup(createElement(TicketCard, { t }));

  it("renders the QR with a quiet zone, crisp edges and a label without the code", () => {
    const n = qrRows(CODE).length;
    const out = html(card({}));
    expect(out).toContain(`viewBox="-4 -4 ${n + 8} ${n + 8}"`);
    expect(out).toContain('shape-rendering="crispEdges"');
    expect(out).toContain('role="img"');
    const label = /<svg[^>]*aria-label="([^"]*)"/.exec(out)?.[1] ?? "";
    expect(label).toBe("QR code ticket for Seeing Machines");
    expect(label).not.toContain(CODE);
    expect(out).toContain(CODE); // human-readable fallback beneath
  });

  it("has a cobalt header and a perforation, and keeps the QR black on white outside any field", () => {
    const out = html(card({}));
    expect(out).toContain('<header class="ticket-h">');
    expect(out).toContain('<span class="sr-only">st(AI)rway ticket</span>');
    expect(out).toContain('class="perf"');
    expect(out).toContain('fill="#ffffff"');
    expect(out).toContain('fill="#000000"');
    expect(out.indexOf('class="perf"')).toBeLessThan(out.indexOf("<svg"));
    expect(out).not.toMatch(/class="[^"]*field/);
    // No ticket code in any accessible name (the code is a bearer secret; it is only the visible fallback text).
    for (const [, value] of out.matchAll(/(?:aria-label|alt|title)="([^"]*)"/g)) expect(value).not.toContain(CODE);
  });

  it("keeps the header and perforation for waitlisted and pending tickets, still without QR, code or token", () => {
    const cases = [
      { status: "waitlisted" as const, notice: { kind: "waitlisted" as const, position: 2, paid: false }, text: "You&#x27;re on the waitlist" },
      { status: "pending_payment" as const, notice: { kind: "pay" as const, holdExpiresAt: future, amountPaise: 19900 }, text: "Payment pending" },
    ];
    for (const c of cases) {
      const out = html(card({ status: c.status, notice: c.notice, waitlistPosition: 2, pass: { kind: "none" }, token: "RAS-01-0007" }));
      expect(out).toContain('<header class="ticket-h">');
      expect(out).toContain('class="perf"');
      expect(out).not.toContain("<svg");
      expect(out).not.toContain(CODE);
      expect(out).not.toContain("RAS-01-0007");
      expect(out).toContain(c.text);
    }
  });

  it("explains expired holds and refunds, and prints the receipt", () => {
    const expired = html(card({ status: "cancelled", notice: { kind: "hold_expired" }, pass: { kind: "none" }, qrRows: null, code: null }));
    expect(expired).toContain("Seat hold expired");
    const refund = html(card({ status: "refund_needed", notice: { kind: "refund_needed", amount: "₹199", latePayment: true },
      pass: { kind: "none" }, qrRows: null, code: null, receipt: { number: "STW-2026-000012", amount: "₹199" } }));
    expect(refund).toContain("Refund pending");
    expect(refund).toContain("₹199 will be refunded");
    expect(refund).toContain("STW-2026-000012");
    const paid = html(card({ receipt: { number: "STW-2026-000013", amount: "₹199" } }));
    expect(paid).toContain("STW-2026-000013 · ₹199 paid");
  });

  it("shows a waitlist state with no QR, no token and no code", () => {
    const out = html(card({ status: "waitlisted", notice: { kind: "waitlisted", position: 3, paid: false }, waitlistPosition: 3, pass: { kind: "none" }, qrRows: null, code: null }));
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

describe("ticket PNG colours", () => {
  it("takes the card colours from the tokens and keeps the QR pure black on white", () => {
    expect(PNG_COLORS).toEqual({
      ink: TOKENS.ink, paper: TOKENS.paper, yellow: TOKENS.yellow, field: TOKENS.field, qrDark: "#000000", qrLight: "#ffffff",
    });
    expect([QR_DARK, QR_LIGHT]).toEqual([TOKENS.black.toLowerCase(), TOKENS.white.toLowerCase()]);
  });

  it("keeps every text colour readable on its background (luminance contrast also holds in greyscale print)", () => {
    expect(contrastRatio(PNG_COLORS.paper, PNG_COLORS.field)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PNG_COLORS.ink, PNG_COLORS.yellow)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PNG_COLORS.ink, PNG_COLORS.paper)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(PNG_COLORS.qrDark, PNG_COLORS.qrLight)).toBeCloseTo(21, 5);
  });

  it("has no hard-coded colours in the PNG renderer", () => {
    const src = readFileSync(resolve(__dirname, "../../lib/tickets/png.ts"), "utf8");
    expect(src).not.toMatch(/["'`]#[0-9a-f]{3,8}["'`]/i);
    // Client-only canvas code: no server modules and no QR encoder (rows arrive precomputed).
    expect(src).not.toMatch(/from\s+["'](?:server-only|node:|@\/lib\/supabase|\.\/qr|uqr)/);
  });
});

describe("ticket PNG fonts", () => {
  it("puts the site face first and always ends in the system stack", () => {
    expect(fontStack("'Urbanist', 'Urbanist Fallback'", FONT_FALLBACK.sans)).toBe(
      `'Urbanist', 'Urbanist Fallback', ${FONT_FALLBACK.sans}`,
    );
    expect(fontStack("  ", FONT_FALLBACK.mono)).toBe(FONT_FALLBACK.mono);
    expect(fontStack(undefined, FONT_FALLBACK.mono)).toBe(FONT_FALLBACK.mono);
  });

  it("keeps the fallback when the canvas rejects the site family (never the 10px default)", () => {
    // A canvas ignores font strings it can't parse; this fake rejects anything mentioning "bad".
    const ctx = {
      value: "10px sans-serif",
      get font() { return this.value; },
      set font(v: string) { if (!v.includes("bad")) this.value = v; },
    };
    setCanvasFont(ctx, "bold 32px", `"bad, ${FONT_FALLBACK.mono}`, FONT_FALLBACK.mono);
    expect(ctx.font).toBe(`bold 32px ${FONT_FALLBACK.mono}`);
    setCanvasFont(ctx, "600 60px", `Urbanist, ${FONT_FALLBACK.sans}`, FONT_FALLBACK.sans);
    expect(ctx.font).toBe(`600 60px Urbanist, ${FONT_FALLBACK.sans}`);
  });

  it("waits for the faces but never throws or hangs", async () => {
    const asked: string[] = [];
    const ok = { load: (s: string) => (asked.push(s), Promise.resolve([] as FontFace[])) };
    await expect(loadCanvasFonts(ok, ["600 60px Anton", "24px Mono"])).resolves.toBe(true);
    expect(asked).toEqual(["600 60px Anton", "24px Mono"]);
    const failing = { load: () => Promise.reject(new SyntaxError("bad font")) };
    await expect(loadCanvasFonts(failing, ["x"])).resolves.toBe(false);
    const throwing = { load: () => { throw new SyntaxError("bad font"); } };
    await expect(loadCanvasFonts(throwing, ["x"])).resolves.toBe(false);
    const never = { load: () => new Promise<FontFace[]>(() => {}) };
    await expect(loadCanvasFonts(never, ["x"], 20)).resolves.toBe(false);
    await expect(loadCanvasFonts(undefined, ["x"])).resolves.toBe(false);
  });
});

describe("ticketView (the page's only source of what to render)", () => {
  const settings = { venue: { name: "CEK", hall: "Main Hall", address: "", city: "", region: "", country: "", postalCode: "", mapEmbed: "", mapLink: "" } };
  // A real code and token on every input: ticketView itself must withhold them unless the seat is confirmed.
  const base: TicketDetail = {
    id: "33333333-3333-4333-8333-333333333333", status: "confirmed", waitlistPosition: null, token: "RAS-01-0007",
    ticketType: "qr", ticketCode: CODE, checkedInAt: null,
    amountPaise: 0, holdExpiresAt: null, receiptNumber: null, paidAt: null, refundedAt: null, cancelReason: null,
    event: {
      id: "e1", slug: "seeing-machines", title: "Seeing Machines", topic: "CV", step: 1, start: future,
      end: "2026-10-20T11:00:00Z", pricePaise: 0, societyShort: "RAS", societyColor: "green",
    },
  };
  const view = (over: Partial<TicketDetail>) => ticketView({ ...base, ...over }, "Asha", settings, { venue: "Lab 2" }, NOW);

  it("gives a confirmed QR seat its rows, code and PNG", () => {
    const v = view({});
    expect(v.heading).toBe("Your ticket");
    expect(v.card.qrRows).toEqual(qrRows(CODE));
    expect(v.card.code).toBe(CODE);
    expect(v.png).toMatchObject({ code: CODE, token: "RAS-01-0007", venue: "Lab 2, CEK" });
    expect(v.cancelBlocked).toBeNull();
    expect(v.upcoming).toBe(true);
  });

  it("gives a confirmed token seat the token and no code", () => {
    const v = view({ ticketType: "token" });
    expect(v.card.pass).toEqual({ kind: "token", token: "RAS-01-0007" });
    expect(v.card.qrRows).toBeNull();
    expect(v.card.code).toBeNull();
    expect(v.png).toMatchObject({ qrRows: null, code: null, token: "RAS-01-0007" });
    expect(JSON.stringify(v)).not.toContain(CODE);
  });

  for (const status of ["waitlisted", "pending_payment", "cancelled", "refunded", "refund_needed"] as const) {
    it(`withholds the code, token, QR and PNG when ${status}`, () => {
      for (const ticketType of ["qr", "token"] as const) {
        const v = view({ status, ticketType, waitlistPosition: status === "waitlisted" ? 2 : null });
        expect(v.card.pass).toEqual({ kind: "none" });
        expect(v.card.qrRows).toBeNull();
        expect(v.card.code).toBeNull();
        expect(v.card.token).toBeNull();
        expect(v.png).toBeNull();
        const out = JSON.stringify(v) + renderToStaticMarkup(createElement(TicketCard, { t: v.card }));
        expect(out).not.toContain(CODE);
        expect(out).not.toContain("RAS-01-0007");
        expect(out).not.toContain("<svg");
      }
    });
  }

  it("adds the receipt and the notice", () => {
    const v = ticketView({ ...base, amountPaise: 19900, receiptNumber: "STW-2026-000012", event: { ...base.event, pricePaise: 19900 } },
      "Asha", settings, { venue: "Lab 2" }, NOW);
    expect(v.card.receipt).toEqual({ number: "STW-2026-000012", amount: "₹199" });
    expect(v.notice).toEqual({ kind: "none" });
    const p = ticketView({ ...base, status: "pending_payment", amountPaise: 19900, holdExpiresAt: future }, "Asha", settings, null, NOW, true);
    expect(p.notice).toEqual({ kind: "processing" });
    expect(p.heading).toBe("Complete your payment");
  });

  it("refund rows (I-3) carry their notice but never a code, QR, token or PNG, in the view or the markup", () => {
    for (const status of ["refund_needed", "refunded"] as const) {
      const v = view({ status, amountPaise: 19900, cancelReason: "late_payment_no_seat", receiptNumber: "STW-2026-000012",
        refundedAt: "2026-10-05T04:30:00Z", event: { ...base.event, pricePaise: 19900 } });
      expect(v.notice.kind).toBe(status);
      expect(v.png).toBeNull();
      expect(v.card.qrRows).toBeNull();
      expect(v.card.code).toBeNull();
      const out = JSON.stringify(v) + renderToStaticMarkup(createElement(TicketCard, { t: v.card }));
      expect(out).not.toContain(CODE);
      expect(out).not.toContain("RAS-01-0007");
      expect(out).not.toContain("<svg");
    }
  });

  it("titles the waitlist state and explains blocked cancels", () => {
    expect(view({ status: "waitlisted", waitlistPosition: 2 }).heading).toBe("Your waitlist place");
    expect(view({ checkedInAt: "2026-10-06T00:00:00Z" }).cancelBlocked).toMatch(/checked in/);
    expect(view({ event: { ...base.event, start: past, end: past } }).upcoming).toBe(false);
  });
});

describe("TicketCard defence in depth", () => {
  const leaky: TicketCardData = {
    eyebrow: "RAS · Step 01", title: "Seeing Machines", when: "Tue", venue: "Hall", name: "Asha",
    status: "waitlisted", waitlistPosition: 2, pass: { kind: "none" }, token: "RAS-01-0007", qrRows: qrRows(CODE),
    code: CODE, checkedInAt: null, notice: { kind: "waitlisted", position: 2, paid: false }, receipt: null,
  };
  const html = (t: TicketCardData) => renderToStaticMarkup(createElement(TicketCard, { t }));

  it("renders no QR or code without a door pass, even when given rows and a code", () => {
    const out = html(leaky);
    expect(out).not.toContain("<svg");
    expect(out).not.toContain(CODE);
    expect(out).not.toContain("RAS-01-0007");
  });

  it("renders no QR or token for a non-confirmed status even with a pass", () => {
    for (const pass of [{ kind: "qr" } as const, { kind: "token", token: "RAS-01-0007" } as const]) {
      const out = html({ ...leaky, pass });
      expect(out).not.toContain("<svg");
      expect(out).not.toContain(CODE);
      expect(out).not.toContain("RAS-01-0007");
    }
  });

  it("token card never contains the code", () => {
    const out = html({ ...leaky, status: "confirmed", pass: { kind: "token", token: "RAS-01-0007" } });
    expect(out).toContain("RAS-01-0007");
    expect(out).not.toContain(CODE);
    expect(out).not.toContain("<svg");
  });
});

describe("analytics never sees ids", () => {
  it("scrubs id segments", () => {
    expect(analyticsPath("/me/tickets/33333333-3333-4333-8333-333333333333")).toBe("/me/tickets/:id");
    expect(analyticsPath("/events/seeing-machines")).toBe("/events/seeing-machines");
  });
  it("bootstrap disables the automatic page_view and escapes the id", () => {
    const js = gaBootstrap("G-1</script><script>alert(1)");
    expect(js).toContain("send_page_view:false");
    expect(js).not.toContain("</script>");
  });
});
