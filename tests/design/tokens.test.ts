import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/design/contrast";
import { CONTRAST_PAIRS, CSS_VARS, FORBIDDEN_PAIRS, TOKENS, type TokenName } from "@/lib/design/tokens";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

describe("design tokens", () => {
  it("app/globals.css :root declares every token with the same hex", () => {
    const entries = Object.entries(CSS_VARS) as [TokenName, string][];
    expect(entries.length).toBeGreaterThan(15);
    for (const [name, cssVar] of entries) {
      const m = new RegExp(`(?:^|\\s)${cssVar}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(root);
      expect(m?.[1]?.toLowerCase(), cssVar).toBe(TOKENS[name].toLowerCase());
    }
  });

  it("every token except literal white/black has a CSS custom property", () => {
    const missing = (Object.keys(TOKENS) as TokenName[]).filter((n) => !CSS_VARS[n]);
    expect(missing.sort()).toEqual(["black", "white"]);
  });

  it("@theme exposes the new colours and Anton as the display face", () => {
    for (const v of ["field", "field-2", "error-bg"]) {
      expect(css).toMatch(new RegExp(`--color-${v}:\\s*var\\(--${v}\\);`));
    }
    expect(css).toMatch(/--font-display:\s*var\(--font-anton\)/);
  });

  it.each(CONTRAST_PAIRS)("$fg on $bg ≥ $min ($use)", ({ fg, bg, min }) => {
    expect(contrastRatio(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(min);
  });

  it.each(FORBIDDEN_PAIRS)("$fg on $bg stays forbidden ($use)", ({ fg, bg }) => {
    expect(contrastRatio(TOKENS[fg], TOKENS[bg])).toBeLessThan(3);
  });
});
