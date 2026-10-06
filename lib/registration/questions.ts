import { z } from "zod";

// Mirrors private.questions_valid() and private.validate_answers() in the database
// (migrations 20261006160228_registrations_hardening and 20261006161107_registration_rpcs).
// Rule: zod may be stricter than the database, never looser, so a value that passes here never makes the RPC fail.
export const TEXT_MAX = 500;
export const TEXTAREA_MAX = 2000;
/** `octet_length(questions::text)` limit in questions_valid(). */
export const QUESTIONS_MAX_BYTES = 16384;
/** `octet_length(answers::text)` limit in register_for_event(). */
export const ANSWERS_MAX_BYTES = 32768;

const unique = (xs: readonly string[]) => new Set(xs).size === xs.length;

/**
 * UTF-8 byte length of Postgres' jsonb text form (`value::text`): `", "` between items and `": "` after keys.
 * String escaping matches JSON.stringify (both escape only `"`, `\` and control characters).
 */
export function jsonbTextBytes(value: unknown): number {
  return new TextEncoder().encode(jsonbText(value)).length;
}

function jsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}: ${jsonbText(v)}`)
      .join(", ")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// The database rejects (rather than trims) a label/option with leading or trailing whitespace, using the JS trim()
// set. U+0085 and U+180E are also refused: Postgres' `\s` may class them as space depending on its locale.
const EXTRA_EDGE_SPACE = /^[\u0085᠎]|[\u0085᠎]$/;
const trimmed = (s: string) => s === s.trim() && !EXTRA_EDGE_SPACE.test(s);
const trimmedText = (max: number) =>
  z.string().min(1).max(max).refine(trimmed, "Remove spaces at the start and end.");

const base = {
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Question ids are lowercase letters, digits and _."),
  label: trimmedText(200),
  help: z.string().max(300).optional(),
  required: z.boolean(),
};
const options = z.array(trimmedText(100)).min(2).max(20).refine(unique, "Options must be unique.");

export const QuestionSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal("text") }),
  z.strictObject({ ...base, type: z.literal("textarea") }),
  z.strictObject({ ...base, type: z.literal("checkbox") }),
  z.strictObject({ ...base, type: z.literal("single_choice"), options }),
  z.strictObject({ ...base, type: z.literal("multi_choice"), options }),
]);
export const QuestionsSchema = z
  .array(QuestionSchema)
  .max(20)
  .refine((qs) => unique(qs.map((q) => q.id)), "Question ids must be unique.")
  .refine((qs) => jsonbTextBytes(qs) <= QUESTIONS_MAX_BYTES, "The questions are too long in total.");

export type Question = z.infer<typeof QuestionSchema>;
export type AnswerValue = string | string[] | boolean;
export type Answers = Record<string, AnswerValue>;

/** Questions from `events.questions` (the DB CHECK already validated them); throws if the shape ever drifts. */
export function parseQuestions(raw: unknown): Question[] {
  return QuestionsSchema.parse(raw ?? []);
}

export function emptyAnswers(questions: readonly Question[]): Answers {
  return Object.fromEntries(
    questions.map((q) => [q.id, q.type === "multi_choice" ? [] : q.type === "checkbox" ? false : ""]),
  );
}

function answerSchema(q: Question): z.ZodType<AnswerValue> {
  switch (q.type) {
    case "text":
    case "textarea": {
      const max = q.type === "text" ? TEXT_MAX : TEXTAREA_MAX;
      // JS trim() strips every whitespace kind (tabs, newlines, NBSP, ...), stricter than the DB's btrim (spaces only).
      const s = z.string().trim().max(max, `Keep it under ${max} characters.`);
      return q.required ? s.min(1, "This question is required.") : s;
    }
    case "single_choice": {
      const choice = z.enum(q.options as [string, ...string[]], { message: "Pick one of the options." });
      return q.required ? choice : z.union([z.literal(""), choice]);
    }
    case "multi_choice": {
      const list = z.array(z.enum(q.options as [string, ...string[]], { message: "Pick from the options." }));
      const sized = q.required ? list.min(1, "Pick at least one.") : list;
      return sized.refine(unique, "Pick each option once.");
    }
    case "checkbox":
      return q.required ? z.literal(true, { message: "Please tick this box to continue." }) : z.boolean();
  }
}

/** Exactly one key per question; unknown keys are rejected (as in the database). */
export function answersSchema(questions: readonly Question[]) {
  return z
    .strictObject(Object.fromEntries(questions.map((q) => [q.id, answerSchema(q)])))
    .refine((a) => jsonbTextBytes(a) <= ANSWERS_MAX_BYTES, "Your answers are too long in total. Shorten them a little.");
}
