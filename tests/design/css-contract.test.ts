import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

describe("globals.css contract", () => {
  it.each([
    ".field::before", ".field::after", ".field-content", ".on-field", ".ghost", ".bands.top", ".bands.bottom",
    ".frame", ".logo-row", ".stair .g", ".stair .ai", ".extrude", ".stair-num", ".rule-h", ".btn-secondary",
    ".btn-ghost", ".tag-field", ".tag-cream", ".stepnum", ".ticket-h", ".perf", ".panel", ".topbar .btn", ".side-strip",
  ])("defines %s", (selector) => {
    expect(css).toContain(selector);
  });

  it("declares --extrude on the stair/extrude rule, never on :root (var(--ink) resolves where it is declared)", () => {
    expect(root).not.toContain("--extrude");
    expect(css).toMatch(/\.stair,\s*\.extrude\s*\{[^}]*--extrude:/);
  });

  it("draws every focus ring from the --focus token and turns it yellow on the field", () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid var\(--focus\)/);
    expect(css).toMatch(/\.on-field\s*\{[^}]*--focus:\s*var\(--yellow\)/);
  });

  it("marks disabled buttons with a dashed border, not opacity", () => {
    const rule = /\.btn:disabled,\s*\.btn\[aria-disabled="true"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("border-style: dashed");
    expect(rule).not.toContain("opacity");
  });

  it("only animates the stair lettering when motion is welcome", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.stair \.g\s*\{\s*animation:/);
  });

  it("keeps print free of the field, its grain and the ghost word", () => {
    expect(css).toMatch(/@media print\s*\{[\s\S]*\.field::before, \.field::after, \.ghost, \.bands/);
  });
});
