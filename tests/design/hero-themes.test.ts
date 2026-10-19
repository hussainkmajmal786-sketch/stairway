import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/design/contrast";
import { CSS_VARS, HERO_PRESETS, HERO_THEMES, heroPairs, TOKENS, type HeroRole, type TokenName } from "@/lib/design/tokens";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const selectorFor = (p: string) => (p === "cobalt" ? '.hero, .hero[data-theme="cobalt"]' : `.hero[data-theme="${p}"]`);
const body = (selector: string) => new RegExp(`(?:^|\\n)\\s*${escRe(selector)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

/** custom properties declared by the rule whose selector is exactly `selector` */
function block(selector: string): Record<string, string> {
  return Object.fromEntries([...body(selector).matchAll(/(--hero-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe("hero themes: CSS mirrors tokens", () => {
  it.each(HERO_PRESETS)("%s: every role aliases its token (null = transparent)", (preset) => {
    const vars = block(selectorFor(preset));
    for (const [role, token] of Object.entries(HERO_THEMES[preset]) as [HeroRole, TokenName | null][]) {
      const want = token === null ? "transparent" : `var(${CSS_VARS[token]})`;
      expect(vars[`--hero-${role}`], `${preset} --hero-${role}`).toBe(want);
    }
  });

  it("has no hex literal inside any hero theme block (colours come from tokens only)", () => {
    for (const p of HERO_PRESETS) {
      const b = body(selectorFor(p));
      expect(b.length).toBeGreaterThan(100);
      expect(b).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("Cobalt Poster is the default look: the base block and the cobalt block are the same rule", () => {
    expect(css).toContain('.hero, .hero[data-theme="cobalt"] {');
  });
});

describe("hero themes: contrast", () => {
  for (const preset of HERO_PRESETS) {
    it.each(heroPairs(preset))(`${preset}: $fg on $bg >= $min ($use)`, ({ fg, bg, min }) => {
      expect(contrastRatio(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(min);
    });
  }

  it("never sets ink type on the cobalt, deep-cobalt or ink fields (frame text, tagline, wordmark, headline row)", () => {
    for (const preset of HERO_PRESETS) {
      const t = HERO_THEMES[preset];
      const field = t.bg;
      if (field !== "field" && field !== "field2" && field !== "ink") continue;
      for (const role of ["fg", "frame", "word", "panel-fg", "cta2-fg"] as const) expect(t[role], `${preset}.${role}`).not.toBe("ink");
    }
  });

  it("no preset sets cobalt type on an ink field; Paper Daylight's cobalt-on-ink extrusion is decoration only", () => {
    for (const preset of HERO_PRESETS) {
      const t = HERO_THEMES[preset];
      if (t.bg !== "ink") continue;
      for (const role of ["fg", "frame", "word", "panel-fg", "accent"] as const) expect(t[role], `${preset}.${role}`).not.toBe("field");
    }
    expect(HERO_THEMES.daylight.word).toBe("field");
    expect(HERO_THEMES.daylight.ext).toBe("ink");
    expect(contrastRatio(TOKENS.field, TOKENS.ink)).toBeLessThan(3);
  });

  it("the (AI) block is ink on yellow in every preset", () => {
    for (const p of HERO_PRESETS) expect([HERO_THEMES[p]["ai-bg"], HERO_THEMES[p]["ai-fg"]]).toEqual(["yellow", "ink"]);
  });
});
