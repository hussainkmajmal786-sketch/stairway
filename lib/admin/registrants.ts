import { z } from "zod";

/** Shape of one row of public.admin_event_registrants(); parsed so a drifting RPC fails loudly. */
export const REGISTRATION_STATUSES = [
  "confirmed", "waitlisted", "pending_payment", "refund_needed", "cancelled", "refunded",
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

const RowSchema = z.object({
  registration_id: z.string(),
  status: z.enum(REGISTRATION_STATUSES),
  token_number: z.number().nullish(),
  waitlist_position: z.number().nullish(),
  checked_in_at: z.string().nullish(),
  created_at: z.string(),
  amount_paise: z.number().nullish(),
  receipt_number: z.string().nullish(),
  razorpay_payment_id: z.string().nullish(),
  full_name: z.string().nullish(),
  handle: z.string().nullish(),
  college: z.string().nullish(),
  branch: z.string().nullish(),
  year: z.union([z.number(), z.string()]).nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  answers: z.unknown().optional(),
});
export type RegistrantRow = z.infer<typeof RowSchema>;

const PageSchema = z.object({ total: z.number(), rows: z.array(RowSchema) });

export function parseRegistrantsPage(raw: unknown): { total: number; rows: RegistrantRow[] } | null {
  const r = PageSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export const STATUS_LABEL: Record<RegistrationStatus, string> = {
  confirmed: "Confirmed",
  waitlisted: "Waitlisted",
  pending_payment: "Pending payment",
  refund_needed: "Refund needed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** `?status=` must be one of the known values; anything else is ignored. */
export function parseStatusFilter(v: unknown): RegistrationStatus | null {
  return typeof v === "string" ? (REGISTRATION_STATUSES.find((s) => s === v) ?? null) : null;
}

/** `?q=` search: trimmed, max 80 chars (the RPC also truncates). Empty -> null. */
export function parseSearch(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80);
  return t === "" ? null : t;
}

/** `?page=` 1-based, clamped. */
export function parsePage(v: unknown, max = 1000): number {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : 1;
}

/** One answer value as plain text (arrays joined, checkbox as Yes/No). */
export function answerText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join("; ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}
