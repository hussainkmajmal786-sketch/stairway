import { formatDate } from "@/lib/weekends";
import type { HeroConfig } from "@/lib/site/schema";
import { ghostWord, padStep } from "./ghost";
import { HERO_DEFAULT_PRESET, type HeroPreset } from "./tokens";

export interface RuleHead {
  lead: string;
  verb: "opens" | "is on";
  when: string;
}

/** The rule head when no session is scheduled (or its date is unreadable): "Next step opens soon". */
export const RULE_HEAD_FALLBACK: RuleHead = { lead: "Next step", verb: "opens", when: "soon" };

/**
 * The hero's poster rule head, e.g. "Step 04 opens Sat 17 Oct" (IST date); "is on" once the step has started.
 * No session (null) or an unparseable start date gives RULE_HEAD_FALLBACK instead of throwing.
 */
export function ruleHead(ev: { step: number; start: string } | null | undefined, now: number): RuleHead {
  const start = ev ? Date.parse(ev.start) : NaN;
  if (!ev || !Number.isFinite(start)) return RULE_HEAD_FALLBACK;
  return {
    lead: `Step ${padStep(ev.step)}`,
    verb: start > now ? "opens" : "is on",
    when: formatDate(ev.start, { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, ""),
  };
}

/**
 * "@handle" from an http(s) profile URL's first path segment, or null. Invisible format characters (\p{Cf}: zero-width
 * spaces/joiners, bidi marks) are dropped and a segment that already starts with "@" (e.g. threads/medium URLs) is not
 * doubled to "@@".
 */
export function handleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const seg = u.pathname.split("/").filter(Boolean)[0];
    if (!seg) return null;
    const name = decodeURIComponent(seg).replace(/\p{Cf}/gu, "").replace(/^@+/, "").trim();
    return name ? `@${name}` : null;
  } catch {
    return null;
  }
}

/** The handles row under the hero: the Instagram handle and the site's host, whichever are valid. */
export function heroHandles(s: { social: { instagram: string }; siteUrl: string }): string[] {
  let host: string | null = null;
  try {
    const u = new URL(s.siteUrl);
    host = u.protocol === "https:" || u.protocol === "http:" ? u.host : null;
  } catch {
    host = null;
  }
  return [handleFromUrl(s.social.instagram), host].filter((x): x is string => !!x);
}

/* ───────── opening-section view model ───────── */

export const HERO_CTA_DEFAULTS = { primary: "Claim your step", secondary: "Explore the societies" } as const;

export type HeroHeadline = { kind: "auto"; lead: string; verb: RuleHead["verb"]; when: string } | { kind: "custom"; text: string };

export interface HeroView {
  preset: HeroPreset;
  /** Motif layers (halftone, blueprint grid, ruled paper, sun…) render. Absent config + Cobalt = today's plain poster. */
  decor: boolean;
  headline: HeroHeadline;
  ghost: string;
  primaryCta: string;
  secondaryCta: string;
  showStats: boolean;
  showFrameText: boolean;
}

/**
 * Turns the stored config (null = none) into what the hero renders. Never throws: junk can't reach it because
 * readHeroConfig clamps on read, and the fallbacks below are the previous hard-coded copy.
 */
export function resolveHero(config: HeroConfig | null | undefined, next: { step: number; start: string } | null | undefined, now: number): HeroView {
  const c = config ?? null;
  const preset = c?.preset ?? HERO_DEFAULT_PRESET;
  const head = ruleHead(next, now);
  const custom = c?.headlineMode === "custom" && c.customHeadline ? c.customHeadline : null;
  return {
    preset,
    decor: c !== null || preset !== "cobalt",
    headline: custom ? { kind: "custom", text: custom } : { kind: "auto", ...head },
    ghost: c?.ghostWord ?? ghostWord({ kind: "home" }),
    primaryCta: c?.primaryCta ?? HERO_CTA_DEFAULTS.primary,
    secondaryCta: c?.secondaryCta ?? HERO_CTA_DEFAULTS.secondary,
    showStats: c?.showStats ?? true,
    showFrameText: c?.showFrameText ?? true,
  };
}

/** "Step 01 / 12" for the decorative progress bars: total = highest step number among the events (at least `step`). */
export function stepProgress(next: { step: number } | null | undefined, events: readonly { step: number }[]): { current: number; total: number } {
  const total = Math.max(1, ...events.map((e) => (Number.isFinite(e.step) ? Math.floor(e.step) : 0)));
  const current = next && Number.isFinite(next.step) && next.step > 0 ? Math.min(Math.floor(next.step), total) : 1;
  return { current, total };
}
