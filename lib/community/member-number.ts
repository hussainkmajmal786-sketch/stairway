import { z } from "zod";

/**
 * IEEE issues both 8-digit member numbers (often with leading zeros) and 9-digit ones. One normaliser for every path
 * (claim, profile, registration, roster CSV, review queue): strip spaces and hyphens, digits only; 7 digits are
 * left-padded to 8 (people drop the leading zero); 8 or 9 digits are kept exactly as typed; anything else is invalid.
 * The database applies the same rule (7 -> lpad 8, then 8 or 9 digits) before hashing. Pure, no I/O.
 */
export function normalizeMemberNumber(raw: string): string | null {
  const s = raw.trim().replace(/[  -]/g, "");
  if (!/^\d{7,9}$/.test(s)) return null;
  return s.length === 7 ? s.padStart(8, "0") : s;
}

export const MEMBER_NUMBER_HINT =
  "IEEE member numbers are 8 or 9 digits (for example 01234567 or 101809133). The IEEE Membership Validator accepts the number as shown on your IEEE card or account.";

export const MEMBER_NUMBER_MESSAGE = "Enter your 8 or 9 digit IEEE member number (for example 01234567 or 101809133).";

/** Required number: trimmed, validated, output is the normalised form. */
export const MemberNumberSchema = z
  .string()
  .trim()
  .refine((v) => normalizeMemberNumber(v) !== null, MEMBER_NUMBER_MESSAGE)
  .transform((v) => normalizeMemberNumber(v) as string);

/** Optional number for profile/registration forms: empty stays empty, otherwise the normalised form. */
export const OptionalMemberNumberSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || normalizeMemberNumber(v) !== null, MEMBER_NUMBER_MESSAGE)
  .transform((v) => (v === "" ? v : (normalizeMemberNumber(v) as string)));
