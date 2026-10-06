import { z } from "zod";
import { OnboardingSchema } from "@/lib/profile/schema";
import { answersSchema, type Answers, type Question } from "./questions";

/**
 * A subset of the profile_private.phone CHECK (`[\s-]` separators there): only ASCII space or `-` here, because
 * JS `\s` also matches Unicode spaces (e.g. NBSP) that Postgres' `\s` may not, which would fail the DB write.
 */
export const PHONE_RE = /^(\+91[ -]?)?[6-9]\d{4}[ -]?\d{5}$/;

/** Profile fields shown (pre-filled) on the registration form and saved back to the profile. */
export const RegistrantSchema = OnboardingSchema.pick({ fullName: true, college: true, branch: true, year: true }).extend({
  phone: z.string().trim().regex(PHONE_RE, "Use a 10-digit Indian mobile number."),
  ieeeMemberId: z.string().trim().regex(/^$|^\d{8,9}$/, "IEEE membership IDs are 8–9 digits."),
});

export interface Registrant {
  fullName: string;
  college: string;
  branch: string;
  year: string;
  phone: string;
  ieeeMemberId: string;
}

export interface RegistrationValues {
  registrant: Registrant;
  answers: Answers;
}

export function registrationSchema(questions: readonly Question[]) {
  return z.strictObject({ registrant: RegistrantSchema, answers: answersSchema(questions) });
}

/** Form element id for a schema path: registrant fields keep their name, answers become `q-<id>`. */
export function fieldIdFor(path: readonly PropertyKey[]): string {
  if (path[0] === "answers" && typeof path[1] === "string") return `q-${path[1]}`;
  if (path[0] === "registrant" && typeof path[1] === "string") return path[1];
  return "form";
}

/** First message per form field. */
export function registrationFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = fieldIdFor(issue.path);
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
