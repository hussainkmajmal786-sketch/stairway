import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Countdown needs the site-data + clock providers to render, so its a11y and sizing contract is checked in source.
const src = readFileSync(join(process.cwd(), "components/ui/Countdown.tsx"), "utf8");

describe("Countdown contract", () => {
  it("announces minute-level text through a polite role=timer and hides the ticking cells", () => {
    expect(src).toMatch(/role="timer" aria-live="polite" aria-atomic="true"/);
    expect(src).toMatch(/\{t\.d\} days, \{t\.h\} hours and \{t\.m\} minutes \{label\}/);
    expect(src).not.toMatch(/\{t\.s\}[^<]*<\/p>/);
    expect(src).toContain('aria-hidden="true"');
  });

  it("lets cells shrink inside narrow containers (320px phones) and caps the phone width at 4rem for md", () => {
    expect(src).toMatch(/aspect-square min-w-0 shrink/);
    expect(src).toContain('md: "w-16 md:w-24"');
    expect(src).toContain('inline-flex max-w-full');
  });
});
