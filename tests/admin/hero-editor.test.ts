import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/admin/site/hero",
}));
vi.mock("@/components/providers/ClockProvider", () => ({ useClock: () => ({ now: 0 }) }));
vi.mock("@/lib/admin/hero-actions", () => ({ saveHeroConfig: vi.fn(), resetHeroConfig: vi.fn() }));

import { HeroEditor } from "@/components/admin/HeroEditor";
import { HeroView } from "@/components/sections/HeroView";
import {
  configToDraft, counter, HERO_DRAFT_DEFAULTS, presetForKey, presetTabIndex, previewProgress, previewView, PREVIEW_NEXT,
} from "@/lib/admin/hero-editor";
import { HERO_PRESETS } from "@/lib/design/tokens";
import { SITE_SECTIONS } from "@/lib/admin/site-sections";

const base = { organizerShort: "IEEE", tagline: "Climb.", handles: ["@x"], stats: [{ label: "Seats", value: 3, suffix: "+" }], registerHref: "/events" };
const clock = (el: React.ReactElement) => el;
const h1s = (html: string) => html.match(/<h1\b/g)?.length ?? 0;

describe("preset keyboard semantics", () => {
  it("moves with arrows, wraps, and supports Home/End", () => {
    expect(presetForKey("cobalt", "ArrowRight")).toBe("ink");
    expect(presetForKey("cobalt", "ArrowDown")).toBe("ink");
    expect(presetForKey("cobalt", "ArrowLeft")).toBe("sunrise");
    expect(presetForKey("cobalt", "ArrowUp")).toBe("sunrise");
    expect(presetForKey("sunrise", "ArrowRight")).toBe("cobalt");
    expect(presetForKey("ink", "Home")).toBe("cobalt");
    expect(presetForKey("ink", "End")).toBe("sunrise");
    expect(presetForKey("ink", "a")).toBeNull();
    expect(presetForKey("ink", "Tab")).toBeNull();
  });
  it("roving tabindex: only the selected preset is tabbable", () => {
    expect(HERO_PRESETS.map((p) => presetTabIndex(p, "daylight"))).toEqual([-1, -1, 0, -1]);
  });
});

describe("draft helpers", () => {
  it("round-trips a config and defaults when none is stored", () => {
    expect(configToDraft(null)).toEqual(HERO_DRAFT_DEFAULTS);
    expect(configToDraft({ preset: "ink", headlineMode: "custom", customHeadline: "Hi", showStats: false, showFrameText: true })).toMatchObject({
      preset: "ink", customHeadline: "Hi", ghostWord: "", showStats: false,
    });
  });
  it("counts characters", () => expect(counter("abc", 60)).toBe("3 / 60"));
  it("previews tolerate half-typed invalid values", () => {
    const v = previewView({ ...HERO_DRAFT_DEFAULTS, preset: "sunrise", headlineMode: "custom", customHeadline: "", ghostWord: "no!" });
    expect(v.preset).toBe("sunrise");
    expect(v.headline.kind).toBe("auto");
    expect(v.ghost).toBe("CLIMB");
  });
});

describe("live preview markup", () => {
  it("preview mode renders no h1 and no section id; the live view has exactly one h1", () => {
    for (const preset of HERO_PRESETS) {
      const view = previewView({ ...HERO_DRAFT_DEFAULTS, preset });
      const props = { ...base, view, next: PREVIEW_NEXT, progress: previewProgress() };
      const live = renderToStaticMarkup(clock(createElement(HeroView, props)));
      const prev = renderToStaticMarkup(clock(createElement(HeroView, { ...props, preview: true })));
      expect(h1s(live)).toBe(1);
      expect(h1s(prev)).toBe(0);
      expect(prev).not.toContain('id="top"');
      expect(prev).not.toContain('id="hero-title"');
      expect(prev).toContain(`data-theme="${preset}"`);
    }
  });
  it("the editor has one h2-level preview label, hides the preview from assistive tech, and adds no h1", () => {
    const html = renderToStaticMarkup(clock(createElement(HeroEditor, { initial: HERO_DRAFT_DEFAULTS, updatedAt: "", preview: base })));
    expect(h1s(html)).toBe(0);
    expect(html).toMatch(/aria-hidden="true"[^>]*inert|inert[^>]*aria-hidden="true"/);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(4);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toContain("0 / 12");
    expect(html).toContain('role="switch"');
  });
  it("lists the editor in the site navigation", () => {
    expect(SITE_SECTIONS.some((s) => s.key === "hero" && s.label === "Opening section")).toBe(true);
  });
});
