"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SettingsSchema } from "@/lib/site/schema";
import { authorize } from "./auth";
import { pickSettingsPatch, SETTINGS_EDITABLE, SettingsPatchSchema, StatsInputSchema } from "./content-schemas";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "./result";

const CONFLICT = "Someone else changed this. Reload to see their changes.";
const Seen = z.string().min(10).max(40);

const asRow = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Changes only the whitelisted settings keys. The raw patch is reduced to SETTINGS_EDITABLE before validation, merged
 * over the stored block (so name, siteUrl, gaId, venue, registration and newsletter can never change here), and the
 * merged result must still satisfy SettingsSchema.
 */
export async function saveSettingsAction(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const auth = await authorize({ kind: "super" });
  if (!auth.ok) return { ok: false, error: auth.error };
  const body = asRow(input);
  const seen = Seen.safeParse(body?.seenUpdatedAt);
  if (!body || !seen.success) return fail("invalid_input", "Reload the page and try again.");

  const picked = pickSettingsPatch(body.patch);
  const keys = Object.keys(picked) as (keyof typeof SettingsPatchSchema.shape)[];
  if (keys.length === 0) return fail("invalid_input", "Nothing to save.");
  const patch = SettingsPatchSchema.partial().safeParse(picked);
  if (!patch.success) return { ok: false, error: fromZod(patch.error) };

  const { data: row, error } = await auth.db.from("site_blocks").select("data, updated_at").eq("key", "settings").maybeSingle();
  if (error || !row) return { ok: false, error: mapDbError(error) };
  if (row.updated_at !== seen.data) return fail("conflict", CONFLICT);

  const current = asRow(row.data) ?? {};
  const merged: Record<string, unknown> = { ...current };
  for (const k of SETTINGS_EDITABLE) if (k in patch.data) merged[k] = patch.data[k as keyof typeof patch.data];
  const check = SettingsSchema.safeParse(merged);
  if (!check.success) return fail("invalid_input", "Those values would break the site settings.");

  const { data, error: writeError } = await auth.db
    .from("site_blocks")
    .update({ data: merged as never })
    .eq("key", "settings")
    .eq("updated_at", seen.data)
    .select("updated_at");
  if (writeError) return { ok: false, error: mapDbError(writeError) };
  if (!data || data.length === 0) return fail("conflict", CONFLICT);
  revalidatePath("/", "layout");
  return okResult({ updatedAt: data[0].updated_at });
}

export async function saveStatsAction(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const auth = await authorize({ kind: "super" });
  if (!auth.ok) return { ok: false, error: auth.error };
  const body = asRow(input);
  const seen = z.string().max(40).safeParse(body?.seenUpdatedAt ?? "");
  if (!body || !seen.success) return fail("invalid_input", "Reload the page and try again.");
  const parsed = StatsInputSchema.safeParse({ items: body.items });
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };

  const { data: row, error } = await auth.db.from("site_blocks").select("updated_at").eq("key", "stats").maybeSingle();
  if (error) return { ok: false, error: mapDbError(error) };

  if (!row) {
    const { data, error: insertError } = await auth.db
      .from("site_blocks")
      .insert({ key: "stats", data: parsed.data as never })
      .select("updated_at")
      .single();
    if (insertError || !data) return { ok: false, error: mapDbError(insertError) };
    revalidatePath("/", "layout");
    return okResult({ updatedAt: data.updated_at });
  }
  if (row.updated_at !== seen.data) return fail("conflict", CONFLICT);
  const { data, error: writeError } = await auth.db
    .from("site_blocks")
    .update({ data: parsed.data as never })
    .eq("key", "stats")
    .eq("updated_at", seen.data)
    .select("updated_at");
  if (writeError) return { ok: false, error: mapDbError(writeError) };
  if (!data || data.length === 0) return fail("conflict", CONFLICT);
  revalidatePath("/", "layout");
  return okResult({ updatedAt: data[0].updated_at });
}
