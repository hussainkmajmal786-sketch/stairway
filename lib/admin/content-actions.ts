"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { authorize } from "./auth";
import { SocietyEditSchema, SocietyIdentitySchema } from "./content-schemas";
import { ENTITIES, ENTITY_RULES, entityPublicPaths, imagePrefix, type Entity } from "./entities";
import { isOwnMediaUrl } from "./media";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "./result";

const CONFLICT = "Someone else changed this. Reload to see their changes.";
const SEEN = z.string().min(10).max(40);

// Table names come from ENTITY_RULES only. This minimal query-builder shape keeps the table a runtime value.
interface Res {
  data: unknown;
  error: { message?: string | null; code?: string | null } | null;
}
interface Q extends PromiseLike<Res> {
  select(columns?: string): Q;
  insert(values: unknown): Q;
  update(values: unknown): Q;
  delete(): Q;
  eq(column: string, value: unknown): Q;
  in(column: string, values: unknown[]): Q;
  order(column: string, opts?: { ascending: boolean }): Q;
  limit(n: number): Q;
  maybeSingle(): PromiseLike<Res>;
  single(): PromiseLike<Res>;
}
const from = (db: unknown, table: string) => (db as { from(t: string): Q }).from(table);
const asRow = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

async function revalidateSociety(db: unknown, societyId: string | null, extra: string[]) {
  for (const p of extra) revalidatePath(p);
  if (!societyId) return;
  const { data } = await from(db, "societies").select("slug").eq("id", societyId).maybeSingle();
  const slug = asRow(data)?.slug;
  if (typeof slug === "string") revalidatePath(`/s/${slug}`);
}

/** Authorises for the society of an existing row (null society = shared = super only), or for a create. */
function scopeFor(rule: (typeof ENTITY_RULES)[Entity], societyId: string | null) {
  return rule.scope === "super" || societyId === null
    ? ({ kind: "super" } as const)
    : ({ kind: "society", societyId } as const);
}

function imagesOk(rule: (typeof ENTITY_RULES)[Entity], data: Record<string, unknown>, societyId: string | null) {
  for (const key of rule.imageKeys) {
    const v = data[key];
    if (typeof v === "string" && !isOwnMediaUrl(v, publicEnv.supabaseUrl, imagePrefix(societyId))) {
      return { key, message: "Upload the image with the uploader." };
    }
  }
  return null;
}

const SaveHead = z.strictObject({
  entity: z.enum(ENTITIES),
  id: z.uuid().optional(),
  societyId: z.uuid().optional(),
  data: z.unknown(),
  seenUpdatedAt: SEEN.optional(),
});

export async function saveEntityAction(input: unknown): Promise<ActionResult<{ id: string; updatedAt: string }>> {
  const first = await authorize({ kind: "any" });
  if (!first.ok) return { ok: false, error: first.error };
  const head = SaveHead.safeParse(input);
  if (!head.success) return { ok: false, error: fromZod(head.error) };
  const { entity, id, societyId, data, seenUpdatedAt } = head.data;
  const rule = ENTITY_RULES[entity];

  let rowSociety: string | null = null;
  let auth: Awaited<ReturnType<typeof authorize>>;
  if (id) {
    if (!seenUpdatedAt) return fail("invalid_input", "Reload the page and try again.");
    // The society of an existing row is read from the row, never from the request.
    const cols = rule.societyColumn ? "id, society_id" : "id";
    const { data: row, error } = await from(first.db, rule.table).select(cols).eq("id", id).maybeSingle();
    const r = asRow(row);
    if (error || !r) return fail("forbidden");
    rowSociety = rule.societyColumn ? ((r.society_id as string | null) ?? null) : null;
    auth = await authorize(scopeFor(rule, rowSociety), first.db);
  } else {
    if (rule.scope === "society" && entity !== "speaker" && !societyId) {
      return fail("invalid_input", "Choose a society.");
    }
    // A speaker without a society is a shared (site-wide) speaker: super admins only.
    rowSociety = rule.scope === "society" ? (societyId ?? null) : null;
    auth = await authorize(scopeFor(rule, rowSociety), first.db);
  }
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = rule.schema.safeParse(data);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const bad = imagesOk(rule, parsed.data, rowSociety);
  if (bad) return fail("invalid_input", bad.message, { [bad.key]: bad.message });
  const columns = rule.toRow(parsed.data);

  if (id) {
    const { data: out, error } = await from(auth.db, rule.table)
      .update(columns)
      .eq("id", id)
      .eq("updated_at", seenUpdatedAt as string)
      .select("id, updated_at");
    if (error) return { ok: false, error: mapDbError(error) };
    const rows = Array.isArray(out) ? out : [];
    if (rows.length === 0) return fail("conflict", CONFLICT);
    await revalidateSociety(auth.db, rowSociety, entityPublicPaths(entity));
    return okResult({ id, updatedAt: String(asRow(rows[0])?.updated_at ?? "") });
  }

  // New rows go to the end of their list.
  let top = from(auth.db, rule.table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
  if (rule.societyColumn) top = rowSociety ? top.eq("society_id", rowSociety) : top;
  const { data: last } = await top;
  const lastRow = Array.isArray(last) ? asRow(last[0]) : null;
  const sortOrder = typeof lastRow?.sort_order === "number" ? lastRow.sort_order + 10 : 10;
  const insert = { ...columns, sort_order: sortOrder, ...(rule.societyColumn && rowSociety ? { society_id: rowSociety } : {}) };
  const { data: created, error } = await from(auth.db, rule.table).insert(insert).select("id, updated_at").single();
  const c = asRow(created);
  if (error || !c) return { ok: false, error: mapDbError(error) };
  await revalidateSociety(auth.db, rowSociety, entityPublicPaths(entity));
  return okResult({ id: String(c.id), updatedAt: String(c.updated_at ?? "") });
}

const DeleteHead = z.strictObject({ entity: z.enum(ENTITIES), id: z.uuid() });

export async function deleteEntityAction(input: unknown): Promise<ActionResult> {
  const first = await authorize({ kind: "any" });
  if (!first.ok) return { ok: false, error: first.error };
  const head = DeleteHead.safeParse(input);
  if (!head.success) return { ok: false, error: fromZod(head.error) };
  const { entity, id } = head.data;
  const rule = ENTITY_RULES[entity];
  const cols = rule.societyColumn ? "id, society_id" : "id";
  const { data: row, error: readError } = await from(first.db, rule.table).select(cols).eq("id", id).maybeSingle();
  const r = asRow(row);
  if (readError || !r) return fail("forbidden");
  const rowSociety = rule.societyColumn ? ((r.society_id as string | null) ?? null) : null;
  const auth = await authorize(scopeFor(rule, rowSociety), first.db);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await from(auth.db, rule.table).delete().eq("id", id).select("id");
  if (error) return { ok: false, error: mapDbError(error) };
  if (!Array.isArray(data) || data.length === 0) return fail("not_found");
  await revalidateSociety(auth.db, rowSociety, entityPublicPaths(entity));
  return okResult(undefined);
}

const ReorderHead = z.strictObject({
  entity: z.enum(ENTITIES),
  societyId: z.uuid().optional(),
  orderedIds: z.array(z.uuid()).min(1).max(100),
});

export async function reorderEntitiesAction(input: unknown): Promise<ActionResult> {
  const first = await authorize({ kind: "any" });
  if (!first.ok) return { ok: false, error: first.error };
  const head = ReorderHead.safeParse(input);
  if (!head.success) return { ok: false, error: fromZod(head.error) };
  const { entity, societyId, orderedIds } = head.data;
  const rule = ENTITY_RULES[entity];
  if (rule.scope === "society" && entity !== "speaker" && !societyId) return fail("invalid_input", "Choose a society.");
  const scope = rule.scope === "society" ? (societyId ?? null) : null;
  const auth = await authorize(scopeFor(rule, scope), first.db);
  if (!auth.ok) return { ok: false, error: auth.error };

  // The ids must be exactly the rows currently in scope (a permutation), re-selected server side.
  let q = from(auth.db, rule.table).select("id");
  if (rule.societyColumn) q = scope ? q.eq("society_id", scope) : q;
  const { data, error } = await q;
  if (error) return { ok: false, error: mapDbError(error) };
  const current = new Set((Array.isArray(data) ? data : []).map((r) => String(asRow(r)?.id)));
  const given = new Set(orderedIds);
  const same = given.size === orderedIds.length && given.size === current.size && orderedIds.every((i) => current.has(i));
  if (!same) return fail("invalid_input", "The list changed. Reload and try again.");

  const results = await Promise.all(
    orderedIds.map((rowId, i) => {
      let u = from(auth.db, rule.table).update({ sort_order: (i + 1) * 10 }).eq("id", rowId);
      if (rule.societyColumn && scope) u = u.eq("society_id", scope);
      return u;
    }),
  );
  const failed = results.find((r) => r.error);
  if (failed) return { ok: false, error: mapDbError(failed.error) };
  await revalidateSociety(auth.db, scope, entityPublicPaths(entity));
  return okResult(undefined);
}

const SocietyHead = z.strictObject({
  societyId: z.uuid(),
  data: z.strictObject({
    description: z.unknown(),
    logoUrl: z.unknown(),
    identity: z.unknown().optional(),
  }),
  seenUpdatedAt: SEEN,
});

/** Description + logo for society admins; identity (name, short name, colour, order) additionally for super admins. */
export async function saveSocietyAction(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const raw = input && typeof input === "object" ? (input as { societyId?: unknown }).societyId : "";
  const auth = await authorize({ kind: "society", societyId: typeof raw === "string" ? raw : "" });
  if (!auth.ok) return { ok: false, error: auth.error };
  const head = SocietyHead.safeParse(input);
  if (!head.success) return { ok: false, error: fromZod(head.error) };
  const { societyId, data, seenUpdatedAt } = head.data;

  const edit = SocietyEditSchema.safeParse({ description: data.description, logoUrl: data.logoUrl });
  if (!edit.success) return { ok: false, error: fromZod(edit.error) };
  if (edit.data.logoUrl !== null && !isOwnMediaUrl(edit.data.logoUrl, publicEnv.supabaseUrl, imagePrefix(societyId))) {
    return fail("invalid_input", "Upload the logo with the uploader.", { logoUrl: "Upload the logo with the uploader." });
  }
  const update: Record<string, unknown> = { description: edit.data.description, logo_url: edit.data.logoUrl };
  if (data.identity !== undefined) {
    if (!auth.ctx.isSuper) return fail("locked", "Only a super admin can change a society's identity.");
    const ident = SocietyIdentitySchema.safeParse(data.identity);
    if (!ident.success) return { ok: false, error: fromZod(ident.error) };
    Object.assign(update, {
      name: ident.data.name, short_name: ident.data.shortName, color: ident.data.color, sort_order: ident.data.sortOrder,
    });
  }
  const { data: out, error } = await from(auth.db, "societies")
    .update(update)
    .eq("id", societyId)
    .eq("updated_at", seenUpdatedAt)
    .select("id, slug, updated_at");
  if (error) {
    // The identity-fields trigger raises 42501: a locked change, not a missing permission.
    if (error.code === "42501") return fail("locked", "Only a super admin can change a society's identity.");
    return { ok: false, error: mapDbError(error) };
  }
  const rows = Array.isArray(out) ? out : [];
  if (rows.length === 0) return fail("conflict", CONFLICT);
  const row = asRow(rows[0]);
  if (typeof row?.slug === "string") revalidatePath(`/s/${row.slug}`);
  revalidatePath("/");
  revalidatePath("/events");
  return okResult({ updatedAt: String(row?.updated_at ?? "") });
}

export type { Entity };
