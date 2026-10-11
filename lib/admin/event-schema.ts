import { z } from "zod";

// Pure helpers + validation for the admin event editor (no server-only imports: used by client and server).
// Mirrors the database CHECKs on public.events (slug pattern, level list, capacity/price >= 0, ends_at > starts_at);
// zod may be stricter than the database, never looser.

export const LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert", "All levels"] as const;
export const MODES = ["offline", "online", "hybrid"] as const;
export const TICKET_TYPES = ["qr", "token"] as const;

const IST_OFFSET_MINUTES = 330;

/** ISO 8601 with an explicit UTC offset (what `istLocalToIso` produces and what Postgres accepts). */
const isoWithOffset = z.iso.datetime({ offset: true, message: "Enter a valid date and time." });
const int = (min: number, max: number, what: string) =>
  z.number({ error: `Enter a whole number for ${what}.` }).int(`Enter a whole number for ${what}.`).min(min, `${what} must be at least ${min}.`).max(max, `${what} can be at most ${max}.`);
const text = (max: number, what: string) => z.string().max(max, `${what} is too long (max ${max} characters).`);

const fields = {
  trackId: z.uuid().nullable(),
  step: int(1, 999, "the step number"),
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/, "Use 2-80 lowercase letters, digits or hyphens."),
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(120, "Title is too long (max 120 characters)."),
  topic: text(120, "Topic"),
  summary: text(300, "Summary"),
  description: text(5000, "Description"),
  startsAt: isoWithOffset,
  endsAt: isoWithOffset,
  venue: text(200, "Venue"),
  mode: z.enum(MODES),
  level: z.enum(LEVELS),
  formats: z.array(z.string().trim().min(1).max(40, "Each format is at most 40 characters.")).max(8, "At most 8 formats."),
  capacity: int(0, 5000, "capacity"),
  pricePaise: int(0, 1_000_000, "the price"),
  ticketType: z.enum(TICKET_TYPES),
  tokenPrefix: z.string().regex(/^[A-Z0-9-]{0,16}$/, "Use up to 16 capital letters, digits or hyphens."),
  registrationOpensAt: isoWithOffset.nullable(),
  registrationClosesAt: isoWithOffset.nullable(),
  isFinale: z.boolean(),
};

type Cross = {
  startsAt: string;
  endsAt: string;
  mode: string;
  venue: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
};

function crossChecks(v: Cross, ctx: z.RefinementCtx) {
  const t = (s: string) => Date.parse(s);
  if (t(v.endsAt) <= t(v.startsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start." });
  if (v.mode !== "online" && v.venue.trim() === "") {
    ctx.addIssue({ code: "custom", path: ["venue"], message: "Add a venue for in-person and hybrid sessions." });
  }
  const o = v.registrationOpensAt;
  const c = v.registrationClosesAt;
  if (o && c && t(o) >= t(c)) ctx.addIssue({ code: "custom", path: ["registrationClosesAt"], message: "Registration must close after it opens." });
  if (c && t(c) > t(v.endsAt)) ctx.addIssue({ code: "custom", path: ["registrationClosesAt"], message: "Registration cannot close after the session ends." });
}

/** Editable event fields (society is never part of an update). */
export const EventFieldsSchema = z.strictObject(fields).superRefine(crossChecks);
/** Create input: the same fields plus the society the event is created in (checked against the admin's roles). */
export const EventInputSchema = z.strictObject({ societyId: z.uuid(), ...fields }).superRefine(crossChecks);

export type EventFields = z.infer<typeof EventFieldsSchema>;
export type EventInput = z.infer<typeof EventInputSchema>;

/** Optimistic-concurrency token: the `updated_at` the editor was loaded with. */
export const SeenUpdatedAt = z.string().min(10).max(40);

// ---------------------------------------------------------------- money

/** "199.50" -> 19950. Up to 6 whole digits and 2 decimals; anything else (exponent, sign, 3 decimals) is null. */
export function rupeesToPaise(input: string): number | null {
  const s = input.trim();
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function paiseToRupees(paise: number): string {
  if (!Number.isFinite(paise) || paise < 0) return "";
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

// ---------------------------------------------------------------- IST date helpers

/** "2026-11-14T10:00" (datetime-local, read as Asia/Kolkata) -> "2026-11-14T10:00:00+05:30". "" when malformed. */
export function istLocalToIso(local: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) return "";
  const iso = `${m[1]}T${m[2]}:${m[3] ?? "00"}+05:30`;
  return Number.isNaN(Date.parse(iso)) ? "" : iso;
}

/** Any ISO instant -> "YYYY-MM-DDTHH:mm" on the Asia/Kolkata wall clock. "" when malformed. */
export function isoToIstLocal(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 16);
}

// ---------------------------------------------------------------- slug / step helpers

/** "Intro to RAG & Agents!" -> "intro-to-rag-agents". May be shorter than the 2-character minimum: validate after. */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Slug for the nth duplicate attempt: `<slug>-copy`, `<slug>-copy-2`, ... always within the 80 character limit. */
export function copySlug(slug: string, attempt: number): string {
  const suffix = attempt <= 0 ? "-copy" : `-copy-${attempt + 1}`;
  return `${slug.slice(0, 80 - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

export function nextStepNumber(existing: readonly number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

/** "Title (copy)" within the 120 character title limit. */
export function copyTitle(title: string): string {
  const suffix = " (copy)";
  return `${title.slice(0, 120 - suffix.length)}${suffix}`;
}

// ---------------------------------------------------------------- publish gate

export interface PublishCheck {
  title: string;
  topic: string;
  venue: string;
  mode: string;
  capacity: number;
  startsAt: string;
  ticketType: string;
  tokenPrefix: string;
}

/** Reasons the session cannot be published (empty = publishable). Run on the STORED row by the server. */
export function publishBlockers(e: PublishCheck, now: number = Date.now()): string[] {
  const out: string[] = [];
  if (e.title.trim().length < 3) out.push("Add a title.");
  if (e.topic.trim() === "") out.push("Add a topic.");
  if (e.mode !== "online" && e.venue.trim() === "") out.push("Add a venue for in-person and hybrid sessions.");
  if (!(e.capacity >= 1)) out.push("Set a capacity of at least 1 seat.");
  if (!(Date.parse(e.startsAt) > now)) out.push("The start time must be in the future.");
  if (e.ticketType === "token" && e.tokenPrefix.trim() === "") out.push("Token tickets need a token prefix.");
  return out;
}

// ---------------------------------------------------------------- editor form <-> input

export interface EventFormValues {
  trackId: string;
  step: string;
  slug: string;
  title: string;
  topic: string;
  summary: string;
  description: string;
  startsLocal: string;
  endsLocal: string;
  venue: string;
  mode: (typeof MODES)[number];
  level: (typeof LEVELS)[number];
  formats: string;
  capacity: string;
  priceRupees: string;
  ticketType: (typeof TICKET_TYPES)[number];
  tokenPrefix: string;
  regOpensLocal: string;
  regClosesLocal: string;
  isFinale: boolean;
}

const optionalIso = (local: string) => (local.trim() === "" ? null : istLocalToIso(local));
const wholeNumber = (s: string) => (/^\d{1,6}$/.test(s.trim()) ? Number(s.trim()) : null);

/** Browser form values -> action input (invalid pieces become null so the schema reports them by field). */
export function formValuesToFields(v: EventFormValues): Record<keyof EventFields, unknown> {
  return {
    trackId: v.trackId === "" ? null : v.trackId,
    step: wholeNumber(v.step),
    slug: v.slug.trim(),
    title: v.title,
    topic: v.topic.trim(),
    summary: v.summary.trim(),
    description: v.description.trim(),
    startsAt: istLocalToIso(v.startsLocal) || null,
    endsAt: istLocalToIso(v.endsLocal) || null,
    venue: v.venue.trim(),
    mode: v.mode,
    level: v.level,
    formats: v.formats.split(",").map((s) => s.trim()).filter(Boolean),
    capacity: wholeNumber(v.capacity),
    pricePaise: rupeesToPaise(v.priceRupees),
    ticketType: v.ticketType,
    tokenPrefix: v.tokenPrefix.trim().toUpperCase(),
    registrationOpensAt: optionalIso(v.regOpensLocal),
    registrationClosesAt: optionalIso(v.regClosesLocal),
    isFinale: v.isFinale,
  };
}

/** Stored `events` row -> editor values (the inverse of `formValuesToFields`). */
export function eventRowToFormValues(r: {
  track_id: string | null; step_number: number; slug: string; title: string; topic: string; summary: string;
  description: string; starts_at: string; ends_at: string; venue: string; mode: string; level: string; formats: string[];
  capacity: number; price_paise: number; ticket_type: string; token_prefix: string;
  registration_opens_at: string | null; registration_closes_at: string | null; is_finale: boolean;
}): EventFormValues {
  const oneOf = <T extends string>(list: readonly T[], v: string, fallback: T): T => (list as readonly string[]).includes(v) ? (v as T) : fallback;
  return {
    trackId: r.track_id ?? "",
    step: String(r.step_number),
    slug: r.slug,
    title: r.title,
    topic: r.topic,
    summary: r.summary,
    description: r.description,
    startsLocal: isoToIstLocal(r.starts_at),
    endsLocal: isoToIstLocal(r.ends_at),
    venue: r.venue,
    mode: oneOf(MODES, r.mode, "offline"),
    level: oneOf(LEVELS, r.level, "All levels"),
    formats: r.formats.join(", "),
    capacity: String(r.capacity),
    priceRupees: paiseToRupees(r.price_paise),
    ticketType: oneOf(TICKET_TYPES, r.ticket_type, "qr"),
    tokenPrefix: r.token_prefix,
    regOpensLocal: r.registration_opens_at ? isoToIstLocal(r.registration_opens_at) : "",
    regClosesLocal: r.registration_closes_at ? isoToIstLocal(r.registration_closes_at) : "",
    isFinale: r.is_finale,
  };
}
