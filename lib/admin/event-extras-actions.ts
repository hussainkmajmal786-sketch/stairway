"use server";

import { z } from "zod";
import { QuestionsSchema, parseQuestions } from "@/lib/registration/questions";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { authorize, type AuthorizeResult } from "./auth";
import {
  AgendaSchema, ListSchema, ResourcesSchema, WinnersSchema, agendaToStored, resourcesToStored,
} from "./content-schemas";
import { SeenUpdatedAt } from "./event-schema";
import { revalidateEventPaths } from "./revalidate";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "./result";

const CONFLICT_MESSAGE = "Someone else changed this session. Reload to see their changes.";
const Id = z.uuid();

const rawId = (input: unknown): string => {
  const v = input && typeof input === "object" ? (input as { id?: unknown }).id : "";
  return typeof v === "string" ? v : "";
};

type Authed = Extract<AuthorizeResult, { ok: true }>;

/** One optimistic-concurrency update of event columns; zero rows is a conflict, never a silent success. */
async function updateColumns(
  auth: Authed,
  id: string,
  seenUpdatedAt: string,
  columns: TablesUpdate<"events">,
  overrideInvalid?: string,
): Promise<ActionResult<{ updatedAt: string }>> {
  const { data, error } = await auth.db
    .from("events")
    .update(columns)
    .eq("id", id)
    .eq("updated_at", seenUpdatedAt)
    .select("id, slug, status, society_id, updated_at");
  if (error) {
    const mapped = mapDbError(error);
    if (overrideInvalid && mapped.code === "invalid_input") return fail("invalid_input", overrideInvalid);
    return { ok: false, error: mapped };
  }
  if (!data || data.length === 0) return fail("conflict", CONFLICT_MESSAGE);
  const row = data[0];
  await revalidateEventPaths(auth.db, { slug: row.slug, societyId: row.society_id, published: row.status === "published", eventId: id });
  return okResult({ updatedAt: row.updated_at });
}

const ContentSchema = z.strictObject({
  id: Id,
  seenUpdatedAt: SeenUpdatedAt,
  agenda: AgendaSchema,
  outcomes: ListSchema,
  prerequisites: ListSchema,
  bring: ListSchema,
});

export async function saveEventContentAction(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const auth = await authorize({ kind: "event", eventId: rawId(input) });
  if (!auth.ok) return { ok: false, error: auth.error };
  const p = ContentSchema.safeParse(input);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  return updateColumns(auth, p.data.id, p.data.seenUpdatedAt, {
    agenda: agendaToStored(p.data.agenda),
    outcomes: p.data.outcomes,
    prerequisites: p.data.prerequisites,
    bring: p.data.bring,
  });
}

const ResourcesInput = z.strictObject({
  id: Id,
  seenUpdatedAt: SeenUpdatedAt,
  resources: ResourcesSchema,
  winners: WinnersSchema,
});

export async function saveEventResourcesAction(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const auth = await authorize({ kind: "event", eventId: rawId(input) });
  if (!auth.ok) return { ok: false, error: auth.error };
  const p = ResourcesInput.safeParse(input);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  return updateColumns(auth, p.data.id, p.data.seenUpdatedAt, {
    resources: resourcesToStored(p.data.resources),
    winners: p.data.winners.map((w) => ({ place: w.place, team: w.team, project: w.project })),
  });
}

const QuestionsInput = z.strictObject({ id: Id, seenUpdatedAt: SeenUpdatedAt, questions: z.unknown() });

export async function saveEventQuestionsAction(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const auth = await authorize({ kind: "event", eventId: rawId(input) });
  if (!auth.ok) return { ok: false, error: auth.error };
  const head = QuestionsInput.safeParse(input);
  if (!head.success) return { ok: false, error: fromZod(head.error) };
  // The same schema the registration form and the database CHECK use.
  const qs = QuestionsSchema.safeParse(head.data.questions);
  if (!qs.success) return { ok: false, error: { ...fromZod(qs.error), message: "These questions are not valid." } };

  // Once people have registered, a question id keeps its type (their answers were given to that question).
  const { count } = await auth.db.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", head.data.id);
  if ((count ?? 0) > 0) {
    const { data: stored } = await auth.db.from("events").select("questions").eq("id", head.data.id).maybeSingle();
    let previous: ReturnType<typeof parseQuestions> = [];
    try {
      previous = parseQuestions(stored?.questions);
    } catch {
      previous = [];
    }
    const types = new Map(previous.map((q) => [q.id, q.type]));
    const changed = qs.data.find((q) => types.has(q.id) && types.get(q.id) !== q.type);
    if (changed) {
      return fail("locked", `"${changed.label}" already has answers, so its type cannot change. Add a new question instead.`);
    }
  }
  return updateColumns(auth, head.data.id, head.data.seenUpdatedAt, { questions: qs.data }, "These questions are not valid.");
}

const SpeakersInput = z.strictObject({ id: Id, speakerIds: z.array(Id).max(20) });

export async function saveEventSpeakersAction(input: unknown): Promise<ActionResult<{ count: number }>> {
  const auth = await authorize({ kind: "event", eventId: rawId(input) });
  if (!auth.ok) return { ok: false, error: auth.error };
  const p = SpeakersInput.safeParse(input);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  const ids = [...new Set(p.data.speakerIds)];
  const societyId = auth.societyId;
  if (!societyId) return fail("forbidden");

  if (ids.length > 0) {
    // Only this society's speakers or shared (society-less) ones, resolved server-side.
    const { data: found, error } = await auth.db.from("speakers").select("id, society_id").in("id", ids);
    if (error) return { ok: false, error: mapDbError(error) };
    const okIds = new Set((found ?? []).filter((s) => s.society_id === null || s.society_id === societyId).map((s) => s.id));
    if (ids.some((x) => !okIds.has(x))) return fail("invalid_input", "One of those speakers is not available to this society.");
    // Upsert the wanted set first, then drop the rest: a failure in between leaves a superset, never an empty list.
    const rows = ids.map((speaker_id, sort_order) => ({ event_id: p.data.id, speaker_id, sort_order }));
    const up = await auth.db.from("event_speakers").upsert(rows, { onConflict: "event_id,speaker_id" });
    if (up.error) return { ok: false, error: mapDbError(up.error) };
  }
  const del = auth.db.from("event_speakers").delete().eq("event_id", p.data.id);
  const { error: delError } = await (ids.length > 0 ? del.not("speaker_id", "in", `(${ids.join(",")})`) : del);
  if (delError) return { ok: false, error: mapDbError(delError) };

  const { error: logError } = await auth.db.rpc("log_admin_event", {
    p_action: "event.speakers",
    p_target_type: "events",
    p_target_id: p.data.id,
    p_society_id: societyId,
    p_summary: { count: ids.length },
  });
  if (logError) return { ok: false, error: mapDbError(logError) };

  const { data: ev } = await auth.db.from("events").select("slug, status, society_id").eq("id", p.data.id).maybeSingle();
  if (ev) await revalidateEventPaths(auth.db, { slug: ev.slug, societyId: ev.society_id, published: ev.status === "published", eventId: p.data.id });
  return okResult({ count: ids.length });
}
