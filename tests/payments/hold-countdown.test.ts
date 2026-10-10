import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const NOW = Date.parse("2026-10-10T10:00:00Z");
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/providers/ClockProvider", () => ({ useClock: () => ({ now: NOW }) }));

import { HoldCountdown } from "@/components/payments/HoldCountdown";
import { holdAnnouncement, holdRemaining } from "@/lib/payments/countdown";

const html = (p: Parameters<typeof HoldCountdown>[0]) => renderToStaticMarkup(createElement(HoldCountdown, p));
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("HoldCountdown (server render)", () => {
  it("renders the time left from the shared clock, with minute-level screen-reader text", () => {
    const out = html({ expiresAt: at(14 * 60_000 + 5_000), suffix: " left to pay" });
    expect(out).toContain('<span aria-hidden="true" class="tabular">14:05 left to pay</span>');
    expect(out).toContain('role="timer" aria-live="polite" aria-atomic="true">15 minutes left to pay</span>');
    expect(out).not.toContain("Hold expired");
    expect(out).not.toContain("<button");
  });

  it("matches the pure helper exactly (server and client compute the same text)", () => {
    const expiresAt = at(61_000);
    const left = holdRemaining(expiresAt, NOW);
    const out = html({ expiresAt });
    expect(out).toContain(`>${left.label}</span>`);
    expect(out).toContain(`>${holdAnnouncement(left)}</span>`);
  });

  it("shows the expired state with a 44px Refresh button and drops the suffix", () => {
    for (const expiresAt of [at(0), at(-60_000), "not a date"]) {
      const out = html({ expiresAt, suffix: " left to pay" });
      expect(out).toContain("Hold expired —");
      expect(out).toMatch(/<button type="button" class="[^"]*min-h-11[^"]*">/);
      expect(out).toContain("Refresh");
      expect(out).not.toContain("left to pay<");
      expect(out).toContain(">Seat hold expired. Refresh the page to start again.</span>");
    }
    // Rendering never refreshes by itself (only the client effect / button does).
    expect(refresh).not.toHaveBeenCalled();
  });
});
