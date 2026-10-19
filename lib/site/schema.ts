import { z } from "zod";
import { HERO_DEFAULT_PRESET, HERO_PRESETS, type HeroPreset } from "@/lib/design/tokens";

const link = z.string();

export const SettingsSchema = z.object({
  name: z.string().min(1),
  tagline: z.string(),
  supportLine: z.string(),
  altTaglines: z.array(z.string()),
  description: z.string(),
  siteUrl: z.url(),
  organizer: z.object({ name: z.string(), short: z.string(), url: link }),
  venue: z.object({
    name: z.string(), hall: z.string(), address: z.string(), city: z.string(), region: z.string(),
    country: z.string(), postalCode: z.string(), mapEmbed: link, mapLink: link,
  }),
  registration: z.object({ mode: z.enum(["onsite", "external"]), googleFormUrl: link }),
  newsletter: z.object({ endpoint: z.string() }),
  // GA4 / Google tag / Ads / UA id, or "" (off). Anything else reads as "" so a typo disables GA instead of the site.
  gaId: z.union([z.literal(""), z.string().regex(/^(G|GT|AW|UA)-[A-Z0-9-]+$/)]).catch(""),
  announcement: z.object({ enabled: z.boolean(), text: z.string() }),
  aftermovieUrl: link,
  sponsorDeckUrl: z.string(),
  speakerFormUrl: link,
  volunteerFormUrl: link,
  contact: z.object({
    email: z.string(),
    sponsorEmail: z.string(),
    coordinators: z.array(z.object({ name: z.string(), role: z.string(), phone: z.string() })),
  }),
  social: z.object({ instagram: link, linkedin: link, whatsapp: link, youtube: link, github: link }),
  ieee: z.object({ joinUrl: link, branchUrl: link }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const StatsSchema = z.object({
  items: z.array(z.object({ label: z.string(), value: z.number(), suffix: z.string() })),
});

/* ───────── opening section (the `hero` site block) ───────── */

export const HERO_LIMITS = { headline: 60, ghost: 12, cta: 24 } as const;

/** Plain-text field: trimmed, whitespace collapsed, 1..max chars, no control (\p{Cc}) or format (\p{Cf}) characters. */
const plainText = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(max).refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v), "No control or invisible characters"));

/** "" (or only blanks) means "not set": the default applies. */
const optionalText = <T extends z.ZodType<string>>(inner: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), inner.optional());

const ghostText = z
  .string()
  .transform((v) => v.replace(/\s+/g, " ").trim().toUpperCase())
  .pipe(z.string().min(1).max(HERO_LIMITS.ghost).regex(/^[A-Z0-9 ]+$/, "A-Z, 0-9 and spaces only"));

/**
 * What the admin may store in the `hero` site block. STRICT: anything invalid throws (use on write). Reads go through
 * readHeroConfig, which never throws.
 */
export const HeroConfigSchema = z
  .object({
    preset: z.enum(HERO_PRESETS).default(HERO_DEFAULT_PRESET),
    headlineMode: z.enum(["auto", "custom"]).default("auto"),
    customHeadline: optionalText(plainText(HERO_LIMITS.headline)),
    ghostWord: optionalText(ghostText),
    primaryCta: optionalText(plainText(HERO_LIMITS.cta)),
    secondaryCta: optionalText(plainText(HERO_LIMITS.cta)),
    showStats: z.boolean().default(true),
    showFrameText: z.boolean().default(true),
  })
  .refine((c) => c.headlineMode !== "custom" || !!c.customHeadline, { path: ["customHeadline"], message: "A custom headline is required" });

export type HeroConfig = z.infer<typeof HeroConfigSchema>;

/** The all-defaults config (what an empty or missing block means). */
export const HERO_DEFAULTS: HeroConfig = { preset: HERO_DEFAULT_PRESET, headlineMode: "auto", showStats: true, showFrameText: true };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * TOLERANT read of the stored block: each field is validated on its own and falls back to its default, unknown keys are
 * ignored, a non-object is "nothing stored" (null). Live data can never break the page.
 */
export function readHeroConfig(raw: unknown): HeroConfig | null {
  if (!isRecord(raw)) return null;
  const pick = <T,>(schema: z.ZodType<T>, v: unknown, fallback: T): T => {
    const r = schema.safeParse(v);
    return r.success ? r.data : fallback;
  };
  const preset = pick<HeroPreset>(z.enum(HERO_PRESETS), raw.preset, HERO_DEFAULT_PRESET);
  const customHeadline = pick<string | undefined>(plainText(HERO_LIMITS.headline), raw.customHeadline, undefined);
  return {
    preset,
    headlineMode: raw.headlineMode === "custom" && customHeadline ? "custom" : "auto",
    customHeadline,
    ghostWord: pick<string | undefined>(ghostText, raw.ghostWord, undefined),
    primaryCta: pick<string | undefined>(plainText(HERO_LIMITS.cta), raw.primaryCta, undefined),
    secondaryCta: pick<string | undefined>(plainText(HERO_LIMITS.cta), raw.secondaryCta, undefined),
    showStats: typeof raw.showStats === "boolean" ? raw.showStats : true,
    showFrameText: typeof raw.showFrameText === "boolean" ? raw.showFrameText : true,
  };
}

/**
 * Write path for the admin editor (Part 2): read-merge-validate. Fields already in the stored block that this schema
 * does not own are kept; the owned fields are replaced by the strictly validated patch merged over the stored values.
 */
export function mergeHeroConfig(existing: unknown, patch: unknown): Record<string, unknown> {
  const base = isRecord(existing) ? existing : {};
  const patchObj = isRecord(patch) ? patch : {};
  const validated = HeroConfigSchema.parse({ ...base, ...patchObj });
  const OWNED = ["preset", "headlineMode", "customHeadline", "ghostWord", "primaryCta", "secondaryCta", "showStats", "showFrameText"];
  const kept = Object.fromEntries(Object.entries(base).filter(([k]) => !OWNED.includes(k)));
  const out: Record<string, unknown> = { ...kept };
  for (const [k, v] of Object.entries(validated)) if (v !== undefined) out[k] = v;
  return out;
}
