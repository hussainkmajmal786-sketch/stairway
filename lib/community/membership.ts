import { z } from "zod";

export const MemberNumberSchema = z.string().trim().regex(/^\d{8,9}$/, "Enter your 8 or 9 digit IEEE member number.");
export const PROOF_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{8,80}$/;

export const REJECT_REASONS = ["unreadable", "mismatch", "expired", "not_member", "other"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const REJECT_COPY: Record<RejectReason, string> = {
  unreadable: "We could not read the image. Upload a clearer, well-lit photo or screenshot of your IEEE membership card.",
  mismatch: "The name or member number on the proof did not match your profile.",
  expired: "The membership on the proof has expired. Renew with IEEE, then submit it again.",
  not_member: "We could not confirm an active IEEE membership from what you sent.",
  other: "An organiser could not approve this claim. You are welcome to submit it again or contact the organisers.",
};

export type MembershipStatus = "none" | "pending_review" | "verified" | "rejected" | "revoked";
export interface MembershipView {
  status: MembershipStatus;
  verified: boolean;
  expired: boolean;
  pending: boolean;
  verifiedUntil: string | null;
  daysLeft: number | null;
  memberNumber: string;
  rejectReason: RejectReason | null;
}

const NONE: MembershipView = {
  status: "none", verified: false, expired: false, pending: false, verifiedUntil: null, daysLeft: null,
  memberNumber: "", rejectReason: null,
};

const RawSchema = z.object({
  status: z.enum(["none", "pending_review", "verified", "rejected", "revoked"]),
  verified: z.boolean().optional(),
  expired: z.boolean().optional(),
  pending: z.boolean().optional(),
  verified_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  days_left: z.number().int().nullable().optional(),
  member_number: z.string().max(12).nullable().optional(),
  reject_reason: z.enum(REJECT_REASONS).nullable().optional(),
});

/** Zod-validated `my_membership()` output; anything unexpected reads as "none". */
export function parseMembership(raw: unknown): MembershipView {
  const r = RawSchema.safeParse(raw);
  if (!r.success) return NONE;
  const d = r.data;
  return {
    status: d.status, verified: d.verified === true, expired: d.expired === true, pending: d.pending === true,
    verifiedUntil: d.verified_until ?? null, daysLeft: d.days_left ?? null,
    memberNumber: d.member_number ?? "", rejectReason: d.reject_reason ?? null,
  };
}

/** `soon` = 30 days or fewer left (inclusive); a verified claim past its date is `expired`. */
export function renewalState(v: MembershipView): "none" | "ok" | "soon" | "expired" {
  if (v.expired) return "expired";
  if (!v.verified || v.daysLeft === null) return "none";
  if (v.daysLeft < 0) return "expired";
  return v.daysLeft <= 30 ? "soon" : "ok";
}

/** Badge visibility computed from a date at READ time (expired = not verified). `today` is a YYYY-MM-DD in IST. */
export function isVerifiedOn(verifiedUntil: string | null | undefined, today: string): boolean {
  return !!verifiedUntil && verifiedUntil >= today;
}

const CLAIM_COPY: Record<string, string> = {
  not_signed_in: "Please sign in again.",
  invalid_number: "Enter your 8 or 9 digit IEEE member number.",
  invalid_proof: "That upload could not be used. Choose a JPG, PNG or WebP image under 5 MB and try again.",
  not_onboarded: "Finish setting up your profile first, then verify your membership.",
  proof_required: "We could not confirm you automatically. Upload a photo of your IEEE card so an organiser can check it.",
  rate_limited: "Too many attempts today. Please try again tomorrow or contact the organisers.",
  name_locked: "Your name is locked while your membership is verified. Contact the organisers to change it.",
  invalid_input: "Some details need attention.",
  forbidden: "You cannot do that.",
};

/** Neutral copy only: never reveals whether a number is on the roster or held by another account. */
export function claimErrorCopy(code: string): string {
  return CLAIM_COPY[code] ?? "Something went wrong. Please try again.";
}

export function formatDateIST(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function todayIST(now = Date.now()): string {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}
