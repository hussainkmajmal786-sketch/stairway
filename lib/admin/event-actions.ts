"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/lib/supabase/database.types";
import { authorize } from "./auth";
import {
  copySlug, copyTitle, EventFieldsSchema, EventInputSchema, nextStepNumber, publishBlockers, SeenUpdatedAt,
  type EventFields,
} from "./event-schema";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "./result";

type Db = SupabaseClient<Database>;

const CONFLICT_MESSAGE = "Someone else changed this session. Reload to see their changes.";
const Id = z.uuid();

/** Public pages that show an event, plus the admin list. Published events only touch the public paths. */
async function revalidateEvent(db: Db, e: { slug: string; societyId: string; published: boolean }) {
  revalidatePath("/admin/events");
  if (!e.published) return;
  revalidatePath(`/events/${e.slug}`);
  revalidatePath("/");
  const { data } = await db.from("societies").select("slug").eq("id", e.societyId).maybeSingle();
  if (data?.slug) revalidatePath(`/s/${data.slug}`);
}

function fieldsToColumns(f: EventFields, isSuper: boolean) {
  return {
    track_id: f.trackId,
    step_number: f.step,
    slug: f.slug,
    title: f.title,
    topic: f.topic,
    summary: f.summary,
    description: f.description,
    starts_at: f.startsAt,
    ends_at: f.endsAt,
    venue: f.venue,
    mode: f.mode,
    level: f.level,
    formats: f.formats,
    capacity: f.capacity,
    price_paise: f.pricePaise,
    ticket_type: f.ticketType,
    token_prefix: f.tokenPrefix,
    registration_opens_at: f.registrationOpensAt,
    registration_closes_at: f.registrationClosesAt,
    // Only super admins may mark a finale; for everyone else the key is absent from the write.
    ...(isSuper ? { is_finale: f.isFinale } : {}),
  };
}

/** The raw client value, only if it is a string (used solely to pick the authorisation scope). */
const rawString = (input: unknown, key: string): string => {
  if (input && typeof input === "object" && key in input) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return "";
};

export async function createEventAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  // The society is the one client-supplied scope; it is only accepted when it is one of the admin's societies.
  const auth = await authorize({ kind: "society", societyId: rawString(input, "societyId") });
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = EventInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const { societyId, ...fields } = parsed.data;
  const row: TablesInsert<"events"> = { society_id: societyId, status: "draft", ...fieldsToColumns(fields, auth.ctx.isSuper) };
  const { data, error } = await auth.db.from("events").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: mapDbError(error) };
  revalidatePath("/admin/events");
  return okResult({ id: data.id });
}

const UpdateSchema = z.object({ id: Id, seenUpdatedAt: SeenUpdatedAt });

export async function updateEventAction(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const auth = await authorize({ kind: "event", eventId: rawString(input, "id") });
  if (!auth.ok) return { ok: false, error: auth.error };
  // Any society in the payload is ignored: the society of an existing event is never client-controlled.
  const { id: _id, seenUpdatedAt: _s, societyId: _ignored, ...rest } = (input ?? {}) as Record<string, unknown>;
  void _id; void _s; void _ignored;
  const head = UpdateSchema.safeParse({ id: rawString(input, "id"), seenUpdatedAt: rawString(input, "seenUpdatedAt") });
  if (!head.success) return { ok: false, error: fromZod(head.error) };
  const parsed = EventFieldsSchema.safeParse(rest);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };

  const { data, error } = await auth.db
    .from("events")
    .update(fieldsToColumns(parsed.data, auth.ctx.isSuper))
    .eq("id", head.data.id)
    .eq("updated_at", head.data.seenUpdatedAt)
    .select("id, slug, status, society_id, updated_at");
  if (error) return { ok: false, error: mapDbError(error) };
  // Zero rows = stale token (or an RLS no-op): never reported as success.
  if (!data || data.length === 0) return fail("conflict", CONFLICT_MESSAGE);
  const row = data[0];
  await revalidateEvent(auth.db, { slug: row.slug, societyId: row.society_id, published: row.status === "published" });
  return okResult({ updatedAt: row.updated_at });
}

const StatusSchema = z.strictObject({ id: Id, status: z.enum(["published", "draft"]), seenUpdatedAt: SeenUpdatedAt });

export async function setEventStatusAction(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const auth = await authorize({ kind: "event", eventId: rawString(input, "id") });
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const { id, status, seenUpdatedAt } = parsed.data;

  if (status === "published") {
    // The gate runs on the stored row, not on anything the client sent.
    const { data: row, error } = await auth.db
      .from("events")
      .select("title, topic, venue, mode, capacity, starts_at, ticket_type, token_prefix")
      .eq("id", id)
      .maybeSingle();
    if (error || !row) return { ok: false, error: mapDbError(error) };
    const blockers = publishBlockers({
      title: row.title, topic: row.topic, venue: row.venue, mode: row.mode, capacity: row.capacity,
      startsAt: row.starts_at, ticketType: row.ticket_type, tokenPrefix: row.token_prefix,
    });
    if (blockers.length > 0) return fail("invalid_input", `Cannot publish yet: ${blockers.join(" ")}`);
  }

  const { data, error } = await auth.db
    .from("events")
    .update({ status })
    .eq("id", id)
    .eq("updated_at", seenUpdatedAt)
    .select("id, slug, society_id, updated_at");
  if (error) return { ok: false, error: mapDbError(error) };
  if (!data || data.length === 0) return fail("conflict", CONFLICT_MESSAGE);
  const row = data[0];
  // Un-publishing must also drop the public pages, so both directions revalidate the public paths.
  await revalidateEvent(auth.db, { slug: row.slug, societyId: row.society_id, published: true });
  return okResult({ updatedAt: row.updated_at });
}

export async function duplicateEventAction(id: unknown): Promise<ActionResult<{ id: string; warning?: string }>> {
  const eventId = typeof id === "string" ? id : "";
  const auth = await authorize({ kind: "event", eventId });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { db, ctx } = auth;

  const { data: src, error: srcError } = await db.from("events").select("*").eq("id", eventId).maybeSingle();
  if (srcError || !src) return { ok: false, error: mapDbError(srcError) };

  let created: { id: string } | null = null;
  let lastError: { message?: string | null; code?: string | null } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const { data: steps } = await db.from("events").select("step_number").eq("society_id", src.society_id);
    const insert: TablesInsert<"events"> = {
      society_id: src.society_id,
      track_id: src.track_id,
      step_number: nextStepNumber((steps ?? []).map((s) => s.step_number)),
      slug: copySlug(src.slug, attempt),
      title: copyTitle(src.title),
      topic: src.topic,
      summary: src.summary,
      description: src.description,
      starts_at: src.starts_at,
      ends_at: src.ends_at,
      venue: src.venue,
      mode: src.mode,
      poster_url: src.poster_url,
      video_url: src.video_url,
      level: src.level,
      formats: src.formats,
      agenda: src.agenda,
      outcomes: src.outcomes,
      prerequisites: src.prerequisites,
      bring: src.bring,
      capacity: src.capacity,
      price_paise: src.price_paise,
      ticket_type: src.ticket_type,
      token_prefix: src.token_prefix,
      questions: src.questions,
      status: "draft",
      is_finale: ctx.isSuper ? src.is_finale : false,
      registration_opens_at: null,
      registration_closes_at: null,
    };
    const { data, error } = await db.from("events").insert(insert).select("id").single();
    if (!error && data) created = data;
    else {
      lastError = error;
      if (error?.code !== "23505") break;
    }
  }
  if (!created) {
    return lastError?.code === "23505"
      ? fail("conflict", "Could not find a free web address for the copy. Rename the original and try again.")
      : { ok: false, error: mapDbError(lastError) };
  }

  let warning: string | undefined;
  const { data: speakers } = await db.from("event_speakers").select("speaker_id, sort_order").eq("event_id", eventId);
  if (speakers && speakers.length > 0) {
    const { error } = await db
      .from("event_speakers")
      .insert(speakers.map((s) => ({ event_id: created.id, speaker_id: s.speaker_id, sort_order: s.sort_order })));
    if (error) warning = "The copy was created but its speakers could not be copied.";
  }
  revalidatePath("/admin/events");
  return okResult({ id: created.id, ...(warning ? { warning } : {}) });
}

export async function deleteDraftEventAction(id: unknown): Promise<ActionResult> {
  const eventId = typeof id === "string" ? id : "";
  const auth = await authorize({ kind: "event", eventId });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.db.from("events").delete().eq("id", eventId).eq("status", "draft").select("id");
  // A registration (FK RESTRICT) turns into a `locked` message.
  if (error) return { ok: false, error: mapDbError(error) };
  if (!data || data.length === 0) return fail("locked", "Only draft sessions can be deleted. Cancel a published session instead.");
  revalidatePath("/admin/events");
  return okResult(undefined);
}

const CancelSchema = z.strictObject({ id: Id, confirmTitle: z.string().max(200) });
const CancelResult = z.object({ cancelled: z.number(), refund_needed: z.number(), waitlisted: z.number() });

export async function cancelEventAction(
  input: unknown,
): Promise<ActionResult<{ cancelled: number; refundNeeded: number; waitlisted: number }>> {
  const auth = await authorize({ kind: "event", eventId: rawString(input, "id") });
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = CancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const { id, confirmTitle } = parsed.data;

  const { data: row, error: readError } = await auth.db.from("events").select("title, slug, society_id").eq("id", id).maybeSingle();
  if (readError || !row) return { ok: false, error: mapDbError(readError) };
  if (confirmTitle !== row.title) {
    return fail("invalid_input", "Type the session title exactly to confirm.", { confirmTitle: "That does not match the title." });
  }
  // Never a plain UPDATE: the RPC cancels seats, flags refunds and promotes nobody.
  const { data, error } = await auth.db.rpc("admin_cancel_event", { p_event_id: id });
  if (error) return { ok: false, error: mapDbError(error) };
  const counts = CancelResult.safeParse(data);
  if (!counts.success) return fail("unknown");
  await revalidateEvent(auth.db, { slug: row.slug, societyId: row.society_id, published: true });
  return okResult({
    cancelled: counts.data.cancelled,
    refundNeeded: counts.data.refund_needed,
    waitlisted: counts.data.waitlisted,
  });
}
