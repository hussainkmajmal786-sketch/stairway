import { z } from "zod";
import { HeroConfigSchema } from "@/lib/site/schema";

/** The keys of the `hero` site block this editor owns (anything else stored in the block is left alone). */
export const HERO_OWNED_KEYS = Object.keys(HeroConfigSchema.shape) as (keyof typeof HeroConfigSchema.shape)[];

/**
 * Strict write input: exactly the owned keys, nothing else (an unknown key is rejected, not stripped), with the same
 * per-field rules as the stored config. Blank optional text means "not set".
 */
export const HeroInputSchema = z
  .strictObject(HeroConfigSchema.shape)
  .refine((c) => c.headlineMode !== "custom" || !!c.customHeadline, { path: ["customHeadline"], message: "A custom headline is required" });

export const HeroSaveSchema = z.strictObject({
  patch: HeroInputSchema,
  /** The block's `updated_at` when the editor loaded; "" when no block existed yet. */
  seenUpdatedAt: z.string().max(40),
});

export const HeroResetSchema = z.strictObject({ seenUpdatedAt: z.string().max(40) });

export const HERO_CONFLICT = "Someone else changed the opening section. Reload to see their changes, then try again.";
