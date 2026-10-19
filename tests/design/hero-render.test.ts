import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HeroView, type HeroViewProps } from "@/components/sections/HeroView";
import { FRAME_ORG } from "@/lib/design/brand";
import { resolveHero } from "@/lib/design/hero";
import { HERO_DEFAULTS } from "@/lib/site/schema";
import { HERO_PRESETS } from "@/lib/design/tokens";

const stats = [
  { label: "Steps", value: 12, suffix: "" },
  { label: "Societies", value: 5, suffix: "" },
];
const props = (over: Partial<HeroViewProps> = {}): HeroViewProps => ({
  view: resolveHero(null, null, 0),
  organizerShort: "IEEE SB CEK",
  tagline: "Climb into the future.",
  handles: ["@ieeesbcek"],
  stats,
  registerHref: "/events/step-01/register",
  next: null,
  progress: { current: 1, total: 12 },
  ...over,
});
const render = (p: HeroViewProps) => renderToStaticMarkup(createElement(HeroView, p));
const withConfig = (c: Parameters<typeof resolveHero>[0]) => props({ view: resolveHero(c, null, 0) });

describe("HeroView", () => {
  it("with no config it is the default Cobalt Poster without motif layers", () => {
    const html = render(props());
    expect(html).toContain('data-theme="cobalt"');
    expect(html).toContain('data-decor="off"');
    expect(html).not.toContain("hero-decor");
    expect(html).not.toContain("stair-line");
    expect(html).toContain("Claim your step");
    expect(html).toContain("CLIMB");
  });

  it.each(HERO_PRESETS)("%s: data-theme, frame text, one h1, one accessible name, motif layer", (preset) => {
    const html = render(withConfig({ ...HERO_DEFAULTS, preset }));
    expect(html).toContain(`data-theme="${preset}"`);
    expect(html).toContain('data-decor="on"');
    expect(html).toContain("hero-decor");
    expect(html).toContain(FRAME_ORG);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html.match(/<h2[\s>]/g)).toBeNull();
    expect(html).toContain('aria-labelledby="hero-title"');
    expect(html).toContain('id="hero-title"');
    expect(html.match(/<span class="sr-only">st\(AI\)rway<\/span>/g)).toHaveLength(1);
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it("showFrameText=false drops the frame text but keeps the frame and the section name", () => {
    const html = render(withConfig({ ...HERO_DEFAULTS, showFrameText: false }));
    expect(html).not.toContain(FRAME_ORG);
    expect(html).toContain('class="frame"');
    expect(html).toContain('aria-labelledby="hero-title"');
  });

  it("showStats=false removes the strip", () => {
    expect(render(withConfig({ ...HERO_DEFAULTS, showStats: false }))).not.toContain("<dl");
    expect(render(props())).toContain("<dl");
  });

  it("escapes a hostile custom headline and CTA labels", () => {
    const evil = "<script>alert(1)</script>";
    const html = render(withConfig({ ...HERO_DEFAULTS, headlineMode: "custom", customHeadline: evil, primaryCta: "<b>x</b>" }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("hero-rule-custom");
  });

  it("uses the ghost word override", () => {
    expect(render(withConfig({ ...HERO_DEFAULTS, ghostWord: "SUMMIT" }))).toContain("SUMMIT");
  });

  it("the component source never uses dangerouslySetInnerHTML", () => {
    for (const f of ["components/sections/HeroView.tsx", "components/sections/Hero.tsx"]) {
      expect(readFileSync(f, "utf8")).not.toContain("dangerouslySetInnerHTML");
    }
  });
});
