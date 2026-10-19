"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "./auth";
import { HERO_CONFLICT, HERO_OWNED_KEYS, HeroResetSchema, HeroSaveSchema } from "./hero-schema";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "./result";
import { mergeHeroConfig } from "@/lib/site/schema";

const asRow = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// Every write goes through the signed-in admin's session client (RLS "super admin site_blocks"); the audit row is
// written by the site_blocks_audit trigger. Nothing here uses the service role.
function revalidateHero() {
  revalidatePath("/");
  revalidatePath("/admin/site/hero");
}

/**
 * Saves the opening-section config. Super admin only (re-authenticated here, never trusted from the page). The stored
 * block is read, merged (fields this editor does not own survive), validated, and written only if `updated_at` still
 * matches what the editor loaded.
 */
export async function saveHeroConfig(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const auth = await authorize({ kind: "super" });
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = HeroSaveSchema.safeParse(input);
  if (!parsed.success) {
    const e = fromZod(parsed.error);
    // Unknown keys / a malformed envelope are not field errors the user can fix.
    if (e.fieldErrors && Object.keys(e.fieldErrors).every((k) => k === "_form" || k === "seenUpdatedAt" || k === "patch")) {
      return fail("invalid_input", "Reload the page and try again.");
    }
    const fieldErrors = Object.fromEntries(Object.entries(e.fieldErrors ?? {}).map(([k, v]) => [k.replace(/^patch\./, ""), v]));
    return { ok: false, error: { ...e, fieldErrors } };
  }
  const { patch, seenUpdatedAt } = parsed.data;

  const { data: row, error } = await auth.db.from("site_blocks").select("data, updated_at").eq("key", "hero").maybeSingle();
  if (error) return { ok: false, error: mapDbError(error) };

  let merged: Record<string, unknown>;
  try {
    // Explicit keys: a cleared optional field arrives as undefined and must override the stored value.
    merged = mergeHeroConfig(row?.data, Object.fromEntries(HERO_OWNED_KEYS.map((k) => [k, patch[k]])));
  } catch {
    return fail("invalid_input", "Those values are not valid.");
  }

  if (!row) {
    if (seenUpdatedAt !== "") return fail("conflict", HERO_CONFLICT);
    const { data, error: insertError } = await auth.db
      .from("site_blocks")
      .insert({ key: "hero", data: merged as never })
      .select("updated_at")
      .single();
    if (insertError?.code === "23505") return fail("conflict", HERO_CONFLICT); // someone else created it first
    if (insertError || !data) return { ok: false, error: mapDbError(insertError) };
    revalidateHero();
    return okResult({ updatedAt: data.updated_at });
  }

  if (row.updated_at !== seenUpdatedAt) return fail("conflict", HERO_CONFLICT);
  const { data, error: writeError } = await auth.db
    .from("site_blocks")
    .update({ data: merged as never })
    .eq("key", "hero")
    .eq("updated_at", seenUpdatedAt)
    .select("updated_at");
  if (writeError) return { ok: false, error: mapDbError(writeError) };
  if (!data || data.length === 0) return fail("conflict", HERO_CONFLICT);
  revalidateHero();
  return okResult({ updatedAt: data[0].updated_at });
}

/**
 * Restores the defaults by removing this editor's keys from the stored block. If nothing else is stored in the block it
 * is removed, so the home page renders exactly the original poster (no config at all).
 */
export async function resetHeroConfig(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const auth = await authorize({ kind: "super" });
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = HeroResetSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", "Reload the page and try again.");
  const { seenUpdatedAt } = parsed.data;

  const { data: row, error } = await auth.db.from("site_blocks").select("data, updated_at").eq("key", "hero").maybeSingle();
  if (error) return { ok: false, error: mapDbError(error) };
  if (!row) {
    if (seenUpdatedAt !== "") return fail("conflict", HERO_CONFLICT);
    return okResult({ updatedAt: "" }); // already at the defaults
  }
  if (row.updated_at !== seenUpdatedAt) return fail("conflict", HERO_CONFLICT);

  const rest = Object.fromEntries(Object.entries(asRow(row.data) ?? {}).filter(([k]) => !(HERO_OWNED_KEYS as string[]).includes(k)));
  if (Object.keys(rest).length === 0) {
    const { data, error: delError } = await auth.db
      .from("site_blocks")
      .delete()
      .eq("key", "hero")
      .eq("updated_at", seenUpdatedAt)
      .select("key");
    if (delError) return { ok: false, error: mapDbError(delError) };
    if (!data || data.length === 0) return fail("conflict", HERO_CONFLICT);
    revalidateHero();
    return okResult({ updatedAt: "" });
  }
  const { data, error: writeError } = await auth.db
    .from("site_blocks")
    .update({ data: rest as never })
    .eq("key", "hero")
    .eq("updated_at", seenUpdatedAt)
    .select("updated_at");
  if (writeError) return { ok: false, error: mapDbError(writeError) };
  if (!data || data.length === 0) return fail("conflict", HERO_CONFLICT);
  revalidateHero();
  return okResult({ updatedAt: data[0].updated_at });
}
