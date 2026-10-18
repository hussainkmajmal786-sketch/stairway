import { z } from "zod";
import { formatDateIST, todayIST } from "./membership";

// Pure read-model parsing and defaults for /admin/membership (no I/O).

const PrescreenSchema = z
  .object({
    status: z.string().optional(),
    readable: z.boolean().optional(),
    number_match: z.boolean().optional(),
    name_match: z.boolean().optional(),
    expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  })
  .passthrough();
export type Prescreen = z.infer<typeof PrescreenSchema>;

export const QueueRowSchema = z.object({
  id: z.uuid(),
  member_number: z.string(),
  full_name: z.string(),
  handle: z.string(),
  email: z.string().default(""),
  created_at: z.string(),
  prescreen: PrescreenSchema.catch({}),
  has_proof: z.boolean(),
});
export const QueueSchema = z.object({ total: z.number().int().min(0), rows: z.array(QueueRowSchema) });
export type QueueRow = z.infer<typeof QueueRowSchema>;

export const VerifiedRowSchema = z.object({
  id: z.uuid(),
  full_name: z.string(),
  handle: z.string(),
  last4: z.string(),
  verified_until: z.string(),
  method: z.string().nullable(),
});
export const VerifiedSchema = z.object({ total: z.number().int().min(0), rows: z.array(VerifiedRowSchema) });
export type VerifiedRow = z.infer<typeof VerifiedRowSchema>;

export const RosterStatusSchema = z.object({ rows: z.number().int().min(0), last_imported_at: z.string().nullable() });

export function parseOr<T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T {
  const r = schema.safeParse(raw);
  return r.success ? r.data : fallback;
}

/** Approval date default: the pre-screen expiry when it is a valid future date within range, else 31 Dec this year (IST). */
export function defaultApprovalDate(expiry: string | null | undefined, now = Date.now()): string {
  const today = todayIST(now);
  const max = addDays(today, 740);
  if (expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry >= today && expiry <= max) return expiry;
  return `${today.slice(0, 4)}-12-31`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface Chip { text: string; tone: "good" | "bad" | "neutral" }
/** Icon-free description of the AI hint; the UI pairs each with an icon and the word. Always a hint, never proof. */
export function prescreenChips(p: Prescreen): Chip[] {
  if (p.status !== "done") return [{ text: "Auto-check not run", tone: "neutral" }];
  if (p.readable === false) return [{ text: "Unreadable", tone: "bad" }];
  const chips: Chip[] = [
    p.number_match ? { text: "Number matches", tone: "good" } : { text: "Number does not match", tone: "bad" },
    p.name_match ? { text: "Name matches", tone: "good" } : { text: "Name does not match", tone: "bad" },
  ];
  chips.push(p.expiry ? { text: `Expiry read: ${formatDateIST(p.expiry)}`, tone: "neutral" } : { text: "No valid expiry read", tone: "neutral" });
  return chips;
}

/** The only IEEE page we link to. Opened in a new tab; no member data is ever put in the URL. */
export const VALIDATOR_URL = "https://vtools.ieee.org/membership-validator/";
export const MAX_APPROVAL_DAYS = 740;
export const EXPIRING_DAYS = 30;

export type ApprovalIssue = "not_confirmed" | "date_missing" | "date_invalid" | "date_past" | "date_too_far";
export const APPROVAL_COPY: Record<ApprovalIssue, string> = {
  not_confirmed: "Tick the box to confirm you checked the IEEE Membership Validator.",
  date_missing: "Enter the expiry date the Membership Validator shows.",
  date_invalid: "That is not a real date.",
  date_past: "The expiry date cannot be in the past. If the membership has lapsed, reject the claim.",
  date_too_far: "The expiry date is more than 2 years away. Check the Membership Validator again.",
};

/** Approve form rule: the Validator checkbox is ticked and the date is a real day from today to 740 days ahead. */
export function validateApproval(input: { confirmed: boolean; verifiedUntil: string }, now = Date.now()): ApprovalIssue | null {
  if (input.confirmed !== true) return "not_confirmed";
  const d = input.verifiedUntil.trim();
  if (!d) return "date_missing";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "date_invalid";
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) return "date_invalid";
  const today = todayIST(now);
  if (d < today) return "date_past";
  if (d > addDays(today, MAX_APPROVAL_DAYS)) return "date_too_far";
  return null;
}

/** True when the membership ends within `days` days (inclusive) and has not lapsed. `today` is YYYY-MM-DD in IST. */
export function isExpiringSoon(verifiedUntil: string, today: string, days = EXPIRING_DAYS): boolean {
  return verifiedUntil >= today && verifiedUntil <= addDays(today, days);
}

export function filterExpiring<T extends { verified_until: string }>(rows: T[], today: string, days = EXPIRING_DAYS): T[] {
  return rows.filter((r) => isExpiringSoon(r.verified_until, today, days));
}
