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
import { cancelBlock, doorPass, QUIET_ZONE, ticketFilename, ticketView } from "@/lib/tickets/view";
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
    for (const status of ["waitlisted", "pending_payment"] as const) {
      const out = html(card({ status, waitlistPosition: 2, pass: { kind: "none" }, token: "RAS-01-0007" }));
      expect(out).toContain('<header class="ticket-h">');
      expect(out).toContain('class="perf"');
      expect(out).not.toContain("<svg");
      expect(out).not.toContain(CODE);
      expect(out).not.toContain("RAS-01-0007");
      expect(out).toContain(status === "waitlisted" ? "You&#x27;re on the waitlist" : "Payment pending");
    }
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
    code: CODE, checkedInAt: null,
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
