import "server-only";
import { formatToken } from "@/lib/tickets/token";
import { authorize } from "./auth";
import { toCsv } from "./csv";
import { answerText, parseRegistrantsPage, type RegistrantRow } from "./registrants";
import { QuestionsSchema, type Question } from "@/lib/registration/questions";

export const EXPORT_PAGE = 200;
export const EXPORT_MAX_ROWS = 2000;

const SLUG = /^[a-z0-9-]+$/;
const NO_BODY = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/** Pure: the CSV text for already-fetched rows (header + rows, formula-safe). Never includes payment ids or codes. */
export function registrantsCsv(opts: {
  rows: readonly RegistrantRow[];
  tokenPrefix: string;
  questions: readonly Question[];
  isSuper: boolean;
  answers: boolean;
}): string {
  const header = ["token", "full_name", "email", "phone", "college", "branch", "year", "status", "checked_in", "registered_at"];
  if (opts.isSuper) header.push("amount_inr", "receipt_number");
  const qs = opts.answers ? opts.questions : [];
  for (const q of qs) header.push(q.label);
  const body = opts.rows.map((r) => {
    const line: unknown[] = [
      typeof r.token_number === "number" ? formatToken(opts.tokenPrefix, r.token_number) : "",
      r.full_name ?? "",
      r.email ?? "",
      r.phone ?? "",
      r.college ?? "",
      r.branch ?? "",
      r.year ?? "",
      r.status,
      r.checked_in_at ? "yes" : "no",
      r.created_at,
    ];
    if (opts.isSuper) line.push(typeof r.amount_paise === "number" ? r.amount_paise / 100 : "", r.receipt_number ?? "");
    const a = r.answers && typeof r.answers === "object" ? (r.answers as Record<string, unknown>) : {};
    for (const q of qs) line.push(answerText(a[q.id]));
    return line;
  });
  return toCsv(header, body);
}

/**
 * Authorised CSV export of one event's registrations. Unauthorised and unknown events are the same empty 404.
 * The audit entry (counts and flags only) is written BEFORE any data leaves; if it fails nothing is served.
 */
export async function exportRegistrations(eventId: string, withAnswers: boolean): Promise<Response> {
  const auth = await authorize({ kind: "event", eventId });
  if (!auth.ok || !auth.societyId) return NO_BODY(404);
  const { db, ctx, societyId } = auth;

  const { data: ev } = await db
    .from("events")
    .select("slug, token_prefix, questions")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return NO_BODY(404);

  const rows: RegistrantRow[] = [];
  let total = 0;
  for (let page = 0; page < EXPORT_MAX_ROWS / EXPORT_PAGE; page++) {
    const { data, error } = await db.rpc("admin_event_registrants", {
      p_event_id: eventId, p_limit: EXPORT_PAGE, p_offset: page * EXPORT_PAGE,
    });
    if (error) return NO_BODY(503);
    const parsed = parseRegistrantsPage(data);
    if (!parsed) return NO_BODY(503);
    total = parsed.total;
    rows.push(...parsed.rows);
    if (parsed.rows.length < EXPORT_PAGE || rows.length >= total) break;
  }
  const truncated = total > EXPORT_MAX_ROWS;
  const exported = rows.slice(0, EXPORT_MAX_ROWS);

  const q = QuestionsSchema.safeParse(ev.questions ?? []);
  const csv = registrantsCsv({
    rows: exported,
    tokenPrefix: ev.token_prefix ?? "",
    questions: q.success ? q.data : [],
    isSuper: ctx.isSuper,
    answers: withAnswers,
  });

  const audit = await db.rpc("log_admin_event", {
    p_action: "registrations.export",
    p_target_type: "event",
    p_target_id: eventId,
    p_society_id: societyId,
    p_summary: { rows: exported.length, answers: withAnswers },
  });
  if (audit.error) return NO_BODY(503);

  const slug = SLUG.test(ev.slug) ? ev.slug : "event";
  return new Response("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-registrations.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(truncated ? { "X-Export-Truncated": "1" } : {}),
    },
  });
}
