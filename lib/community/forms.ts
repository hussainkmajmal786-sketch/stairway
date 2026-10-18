import { z } from "zod";

export const FORM_MIN_FILL_MS = 3000;

// Identical in spirit to the SQL CHECKs (cr_* constraints and community_details_valid).
const URL_RE = /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/[^\s<>"'\u0000-\u001f\u007f]*)?$/;
const PHONE_RE = /^\+?[0-9][0-9 -]{6,18}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Control characters are rejected except \n \r \t.
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function text(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, `Use at least ${min} characters.`)
    .max(max, `Use at most ${max} characters.`)
    .refine((s) => !/[<>]/.test(s), "Remove < and > characters.")
    .refine((s) => !CONTROL_RE.test(s), "Remove special control characters.");
}

/** "" -> undefined, otherwise the inner schema. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal("").transform(() => undefined), schema]).optional() as z.ZodType<z.infer<T> | undefined>;

const website = optional(
  z.string().trim().max(300).regex(URL_RE, "Use a full https:// link."),
);

const contact = {
  name: text(2, 80),
  email: z.string().trim().toLowerCase().max(254, "That email is too long.").regex(EMAIL_RE, "Enter a valid email."),
  phone: optional(z.string().trim().regex(PHONE_RE, "Enter a valid phone number.")),
  organisation: optional(text(1, 120)),
};

const common = {
  subject: text(3, 120),
  message: text(10, 2000),
  hp: z.string().max(200),
  startedAt: z.number(),
};

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real date.")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Use a real date.");

const HostEvent = z
  .object({
    kind: z.literal("host_event"),
    anonymous: z.literal(false).optional(),
    ...contact,
    ...common,
    details: z
      .object({
        event_title: text(3, 120),
        expected_attendees: z.number().int().min(1).max(10000).optional(),
        preferred_date: isoDate.optional(),
        venue: optional(text(1, 120)),
        website,
      })
      .strict(),
  })
  .strict();

const Partner = z
  .object({
    kind: z.literal("partner"),
    anonymous: z.literal(false).optional(),
    ...contact,
    ...common,
    details: z
      .object({ partnership_type: z.enum(["sponsor", "venue", "media", "community", "other"]), website })
      .strict(),
  })
  .strict();

const FeedbackNamed = z
  .object({
    kind: z.literal("feedback"),
    anonymous: z.literal(false).optional(),
    ...contact,
    ...common,
    details: z.object({ category: z.enum(["suggestion", "complaint", "other"]) }).strict(),
  })
  .strict();

const FeedbackAnonymous = z
  .object({
    kind: z.literal("feedback"),
    anonymous: z.literal(true),
    ...common,
    details: z.object({ category: z.enum(["suggestion", "complaint", "other"]) }).strict(),
  })
  .strict();

/** Discriminated by `kind`; `anonymous: true` exists only on feedback and carries no contact fields at all. */
export const CommunityFormSchema = z.union([HostEvent, Partner, FeedbackNamed, FeedbackAnonymous]);
export type CommunityForm = z.infer<typeof CommunityFormSchema>;

const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;
export function clientIp(h: Headers): string | null {
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf && IP_RE.test(cf)) return cf;
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && IP_RE.test(first) ? first : null;
}

export async function hashIp(ip: string, salt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A filled honeypot or a sub-3-second fill is a bot: the caller fakes success and stores nothing. */
export function formVerdict({ hp, startedAt, now }: { hp: string; startedAt: number; now: number }): "ok" | "bot" {
  if (hp !== "") return "bot";
  if (!Number.isFinite(startedAt) || now - startedAt < FORM_MIN_FILL_MS) return "bot";
  return "ok";
}

const FORM_COPY: Record<string, string> = {
  invalid_input: "Some fields need attention.",
  rate_limited: "You have sent several messages today already. Please try again tomorrow.",
  busy: "We are receiving a lot of messages right now. Please try again later.",
  unavailable: "The service is unavailable. Please try again in a moment.",
};
export function formErrorCopy(code: string): string {
  return FORM_COPY[code] ?? "Something went wrong. Please try again.";
}
