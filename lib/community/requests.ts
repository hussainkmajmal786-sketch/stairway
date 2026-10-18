import { z } from "zod";
import { toCsv } from "@/lib/admin/csv";

// Pure read model + filters for the super-admin requests inbox (no I/O, no server-only imports).

export const REQUEST_KINDS = ["host_event", "partner", "feedback"] as const;
export const REQUEST_STATUSES = ["new", "in_review", "resolved", "closed"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUESTS_PAGE = 50;
export const REQUESTS_EXPORT_MAX = 2000;
export const EXPORT_HEADER = ["id", "kind", "status", "created_at", "organisation", "subject"] as const;

export const KIND_LABEL: Record<RequestKind, string> = {
  host_event: "Host an event",
  partner: "Partner",
  feedback: "Feedback",
};
export const STATUS_LABEL: Record<RequestStatus, string> = {
  new: "New",
  in_review: "In review",
  resolved: "Resolved",
  closed: "Closed",
};

export interface RequestFilters {
  kind: RequestKind | null;
  status: RequestStatus | null;
  /** ISO instant, start of day IST (inclusive). */
  from: string | null;
  /** ISO instant, start of the NEXT day IST (exclusive). */
  to: string | null;
  page: number;
}

const one = (v: unknown): string | undefined => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function istStart(d: string, plusDays = 0): string | null {
  if (!DAY.test(d)) return null;
  const t = Date.parse(`${d}T00:00:00+05:30`);
  if (Number.isNaN(t)) return null;
  const iso = new Date(t + plusDays * 86_400_000).toISOString();
  // reject impossible dates that Date.parse rolls over (2027-02-31)
  return new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" }) === d ? iso : null;
}

/**
 * Query string -> filters. `strict` (the CSV route) reports any present-but-invalid value as an error; the page
 * silently drops what it cannot understand.
 */
export function parseRequestFilters(
  sp: Record<string, unknown>,
  strict = false,
): { ok: true; filters: RequestFilters } | { ok: false } {
  const kind = one(sp.kind) ?? "";
  const status = one(sp.status) ?? "";
  const from = one(sp.from) ?? "";
  const to = one(sp.to) ?? "";
  const kindOk = (REQUEST_KINDS as readonly string[]).includes(kind);
  const statusOk = (REQUEST_STATUSES as readonly string[]).includes(status);
  const fromIso = from ? istStart(from) : null;
  const toIso = to ? istStart(to, 1) : null;
  if (strict && ((kind && !kindOk) || (status && !statusOk) || (from && !fromIso) || (to && !toIso))) return { ok: false };
  const page = Number.parseInt(one(sp.page) ?? "1", 10);
  return {
    ok: true,
    filters: {
      kind: kindOk ? (kind as RequestKind) : null,
      status: statusOk ? (status as RequestStatus) : null,
      from: fromIso,
      to: toIso,
      page: Number.isFinite(page) && page >= 1 ? Math.min(page, 1000) : 1,
    },
  };
}

/** Query string for links that keep the current filters (no page). */
export function filterQuery(sp: Record<string, unknown>): string {
  const r = parseRequestFilters(sp);
  const u = new URLSearchParams();
  if (!r.ok) return "";
  if (r.filters.kind) u.set("kind", r.filters.kind);
  if (r.filters.status) u.set("status", r.filters.status);
  const from = one(sp.from);
  const to = one(sp.to);
  if (r.filters.from && from) u.set("from", from);
  if (r.filters.to && to) u.set("to", to);
  return u.toString();
}

// Only these columns are ever selected by the inbox. user_id and ip_hash are never read.
export const INBOX_COLUMNS = "id, kind, status, is_anonymous, name, email, phone, organisation, subject, message, details, admin_note, created_at";

const RowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(REQUEST_KINDS),
  status: z.enum(REQUEST_STATUSES),
  is_anonymous: z.boolean(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  organisation: z.string().nullable(),
  subject: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).catch({}),
  admin_note: z.string(),
  created_at: z.string(),
});

export interface InboxRow {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  anonymous: boolean;
  name: string | null;
  email: string | null;
  phone: string | null;
  organisation: string | null;
  subject: string;
  message: string;
  details: [string, string][];
  adminNote: string;
  createdAt: string;
}

const EMAIL_SAFE = /^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/;

/**
 * Rows from the database -> display rows. Anonymous rows are forced to carry NO sender-identifying field, whatever the
 * database returned (defence in depth on top of the cr_anon_feedback_only CHECK). Unparseable rows are dropped.
 */
export function parseInboxRows(raw: unknown): InboxRow[] {
  if (!Array.isArray(raw)) return [];
  const out: InboxRow[] = [];
  for (const item of raw) {
    const r = RowSchema.safeParse(item);
    if (!r.success) continue;
    const d = r.data;
    const anon = d.is_anonymous;
    out.push({
      id: d.id,
      kind: d.kind,
      status: d.status,
      anonymous: anon,
      name: anon ? null : d.name,
      email: anon ? null : d.email && EMAIL_SAFE.test(d.email) ? d.email : null,
      phone: anon ? null : d.phone,
      organisation: anon ? null : d.organisation,
      subject: d.subject,
      message: d.message,
      details: Object.entries(d.details).map(([k, v]) => [k.replace(/_/g, " "), typeof v === "string" || typeof v === "number" ? String(v) : ""] as [string, string]),
      adminNote: d.admin_note,
      createdAt: d.created_at,
    });
  }
  return out;
}

export const NOTE_MAX = 1000;
export const UpdateInput = z
  .object({ id: z.uuid(), status: z.enum(REQUEST_STATUSES), note: z.string().max(NOTE_MAX) })
  .strict();

/** Minimal export: no name/email/phone/message/note. Formula-safe via toCsv. */
export function requestsCsv(rows: readonly { id: string; kind: string; status: string; created_at: string; organisation: string | null; subject: string }[]): string {
  return toCsv(EXPORT_HEADER, rows.map((r) => [r.id, r.kind, r.status, r.created_at, r.organisation ?? "", r.subject]));
}
