import { z } from "zod";

/**
 * IEEE member numbers are 8 digits with leading zeros (the vTools Membership Validator looks them up that way).
 * Accept 7 or 8 digits (people drop the leading zero), pad to 8, reject anything else. Pure, no I/O.
 */
export function normalizeMemberNumber(raw: string): string | null {
  const s = raw.trim();
  return /^\d{7,8}$/.test(s) ? s.padStart(8, "0") : null;
}

export const MEMBER_NUMBER_MESSAGE = "Enter your 8 digit IEEE member number (7 digits is fine, we add the leading zero).";

/** Required number: trimmed, validated, output is always the 8-digit form. */
export const MemberNumberSchema = z
  .string()
  .trim()
  .refine((v) => normalizeMemberNumber(v) !== null, MEMBER_NUMBER_MESSAGE)
  .transform((v) => normalizeMemberNumber(v) as string);

/**
 * Optional number for profile/registration forms: empty stays empty, otherwise the 8-digit form. A legacy 9-digit value
 * already allowed by the database check passes through unchanged so existing profiles can still be saved.
 */
export const OptionalMemberNumberSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{9}$/.test(v) || normalizeMemberNumber(v) !== null, MEMBER_NUMBER_MESSAGE)
  .transform((v) => (v === "" || /^\d{9}$/.test(v) ? v : (normalizeMemberNumber(v) as string)));
