import { HERO_PRESETS, type HeroPreset } from "@/lib/design/tokens";
import { resolveHero, stepProgress, type HeroView } from "@/lib/design/hero";
import { HERO_LIMITS, readHeroConfig, type HeroConfig } from "@/lib/site/schema";

/** What the form holds: every field as the user typed it (optional text is "" when unset). */
export interface HeroDraft {
  preset: HeroPreset;
  headlineMode: "auto" | "custom";
  customHeadline: string;
  ghostWord: string;
  primaryCta: string;
  secondaryCta: string;
  showStats: boolean;
  showFrameText: boolean;
}

export const HERO_DRAFT_DEFAULTS: HeroDraft = {
  preset: "cobalt", headlineMode: "auto", customHeadline: "", ghostWord: "", primaryCta: "", secondaryCta: "",
  showStats: true, showFrameText: true,
};

export function configToDraft(c: HeroConfig | null): HeroDraft {
  if (!c) return { ...HERO_DRAFT_DEFAULTS };
  return {
    preset: c.preset, headlineMode: c.headlineMode, customHeadline: c.customHeadline ?? "", ghostWord: c.ghostWord ?? "",
    primaryCta: c.primaryCta ?? "", secondaryCta: c.secondaryCta ?? "", showStats: c.showStats, showFrameText: c.showFrameText,
  };
}

/** The payload for saveHeroConfig: exactly the eight owned keys. */
export function draftToPatch(d: HeroDraft): HeroDraft {
  return { ...d };
}

/** "12 / 60" */
export const counter = (value: string, max: number) => `${value.length} / ${max}`;
export const COUNTER_MAX = HERO_LIMITS;

/* ───────── preset radio group (roving tabindex, arrow keys) ───────── */

/** The preset an arrow/Home/End key moves to (the group wraps), or null when the key is not a group key. */
export function presetForKey(current: HeroPreset, key: string): HeroPreset | null {
  const n = HERO_PRESETS.length;
  const i = HERO_PRESETS.indexOf(current);
  if (key === "ArrowRight" || key === "ArrowDown") return HERO_PRESETS[(i + 1) % n];
  if (key === "ArrowLeft" || key === "ArrowUp") return HERO_PRESETS[(i - 1 + n) % n];
  if (key === "Home") return HERO_PRESETS[0];
  if (key === "End") return HERO_PRESETS[n - 1];
  return null;
}

/** Roving tabindex: only the selected card is in the tab order. */
export const presetTabIndex = (preset: HeroPreset, selected: HeroPreset): 0 | -1 => (preset === selected ? 0 : -1);

/* ───────── live preview ───────── */

// A fixed sample step far in the future: the preview never touches the network or the real schedule.
export const PREVIEW_NOW = Date.parse("2099-01-01T00:00:00Z");
export const PREVIEW_NEXT = {
  slug: "sample", title: "Sample session", topic: "A sample topic", step: 4, start: "2099-06-13T04:30:00Z",
};

/** The preview view model for a draft. Tolerant on purpose: a half-typed invalid field falls back to its default. */
export function previewView(d: HeroDraft): HeroView {
  return resolveHero(readHeroConfig(draftToPatch(d)), PREVIEW_NEXT, PREVIEW_NOW);
}
export const previewProgress = () => stepProgress(PREVIEW_NEXT, [PREVIEW_NEXT, { step: 12 }]);
