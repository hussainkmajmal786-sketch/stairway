import { z } from "zod";
import { BRANCHES, YEARS } from "./options";
import { HANDLE_RE } from "./handle";

const httpUrl = z.url({ protocol: /^https?$/, message: "Enter a full link starting with https://" });
const optionalUrl = z.union([z.literal(""), httpUrl]);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Pick a real date.");

const fullName = z.string().trim().min(2, "Tell us your full name.").max(80);
const college = z.string().trim().min(2, "Which college are you from?").max(120);
const branch = z.enum(BRANCHES, { message: "Pick your branch." });
const year = z.enum(YEARS, { message: "Pick your year." });

export const OnboardingSchema = z.object({
  fullName,
  handle: z.string().trim().toLowerCase().regex(HANDLE_RE, "3–30 characters: letters, numbers, - or _ (start with a letter or number)."),
  college,
  branch,
  year,
});

export const ProfileDetailsSchema = z.object({
  fullName,
  college,
  branch,
  year,
  headline: z.string().trim().max(120, "Keep the headline under 120 characters."),
  bio: z.string().trim().max(1500, "Keep the bio under 1500 characters."),
  skills: z.array(z.string().trim().min(1).max(30)).max(30, "Up to 30 skills."),
  links: z.object({
    linkedin: optionalUrl, github: optionalUrl, x: optionalUrl, instagram: optionalUrl, website: optionalUrl,
  }),
});

export const PrivateSchema = z.object({
  phone: z.string().trim().regex(/^$|^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/, "Use a 10-digit Indian mobile number."),
  ieeeMemberId: z.string().trim().regex(/^$|^\d{8,9}$/, "IEEE membership IDs are 8–9 digits."),
});

export const ProjectSchema = z.object({
  title: z.string().trim().min(2, "Give the project a title.").max(100),
  description: z.string().trim().max(500, "Keep it under 500 characters."),
  url: optionalUrl,
});

export const ExperienceSchema = z
  .object({
    title: z.string().trim().min(2, "What was your role?").max(100),
    organization: z.string().trim().min(2, "Where was it?").max(100),
    startDate: isoDate,
    endDate: z.union([z.literal(""), isoDate]),
    description: z.string().trim().max(500, "Keep it under 500 characters."),
  })
  .refine((d) => d.endDate === "" || d.endDate >= d.startDate, {
    message: "End date must be after the start date.",
    path: ["endDate"],
  });

/** First message per field, keyed by dotted path (e.g. "links.github"). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
