import { z } from "zod";

// Event content blocks stored as jsonb / text[]. Every schema is strict and the stored value is rebuilt from the
// parsed data (no passthrough of unknown keys). Lengths are caps, not the database's limits (it has none).

const trimmed = (min: number, max: number, what: string) =>
  z.string().trim().min(min, `${what} is required.`).max(max, `${what} is too long (max ${max} characters).`);
const https = (max = 500) =>
  z.string().trim().max(max, `The link is too long (max ${max} characters).`).refine(
    (s) => {
      if (!s.startsWith("https://")) return false;
      try {
        const u = new URL(s);
        return u.protocol === "https:" && u.username === "" && u.password === "";
      } catch {
        return false;
      }
    },
    "Use a full https:// link.",
  );

export const AgendaSchema = z
  .array(
    z.strictObject({
      time: trimmed(1, 20, "The time"),
      title: trimmed(1, 120, "The title"),
      detail: z.string().trim().max(400, "The detail is too long (max 400 characters).").optional(),
    }),
  )
  .max(30, "At most 30 agenda items.");
export type Agenda = z.infer<typeof AgendaSchema>;

/** outcomes / prerequisites / bring */
export const ListSchema = z.array(trimmed(1, 120, "Each item")).max(20, "At most 20 items.");

// "" means "not set" (the form sends empty inputs); it is dropped when stored.
const optionalHttps = z.union([z.literal(""), https()]).optional();
export const ResourcesSchema = z.strictObject({
  slides: optionalHttps,
  code: optionalHttps,
  notebook: optionalHttps,
  recording: optionalHttps,
  reading: z.array(z.strictObject({ label: trimmed(1, 80, "The label"), href: https() })).max(20, "At most 20 reading links.").optional(),
});

export const WinnersSchema = z
  .array(
    z.strictObject({
      place: trimmed(1, 40, "The place"),
      team: trimmed(1, 80, "The team"),
      project: z.string().trim().max(120, "The project is too long (max 120 characters)."),
    }),
  )
  .max(10, "At most 10 winners.");

/** Rebuilt for storage: empty optional strings and empty lists are dropped so the stored JSON stays minimal. */
export function agendaToStored(items: Agenda): { time: string; title: string; detail?: string }[] {
  return items.map((i) => ({ time: i.time, title: i.title, ...(i.detail ? { detail: i.detail } : {}) }));
}

export function resourcesToStored(r: z.infer<typeof ResourcesSchema>) {
  const out: Record<string, string | { label: string; href: string }[]> = {};
  for (const k of ["slides", "code", "notebook", "recording"] as const) if (r[k]) out[k] = r[k];
  if (r.reading && r.reading.length > 0) out.reading = r.reading.map((x) => ({ label: x.label, href: x.href }));
  return out;
}

// ---- Society, site content and settings (Phase 5, Task 9) -----------------------------------------------------
// One strict schema per editable entity. Text is trimmed with explicit caps; every URL is https only. Image URLs are
// additionally checked with isOwnMediaUrl at action time (they must be objects in this project's media bucket).

const text = (max: number, what = "This") =>
  z.string().trim().max(max, `${what} is too long (max ${max} characters).`);
/** "" means "not set". */
const optionalLink = z.union([z.literal(""), https()]);
/** A stored image: null clears it. */
const imageUrl = z.union([z.null(), https(600)]);

export const SOCIETY_COLORS = ["yellow", "blue", "green", "red", "orange", "purple"] as const;

export const SocietyEditSchema = z.strictObject({
  description: text(600, "The description"),
  logoUrl: imageUrl,
});
export const SocietyIdentitySchema = z.strictObject({
  name: trimmed(2, 80, "The name"),
  shortName: trimmed(1, 20, "The short name"),
  color: z.enum(SOCIETY_COLORS),
  sortOrder: z.number().int().min(0).max(10000),
});

export const TrackSchema = z.strictObject({
  name: trimmed(2, 80, "The name"),
  description: text(300, "The description"),
});

export const SpeakerSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "Use 2-60 lowercase letters, digits or dashes."),
  name: trimmed(2, 80, "The name"),
  designation: text(100, "The designation"),
  organization: text(100, "The organization"),
  photoUrl: imageUrl,
  bio: text(800, "The bio"),
  topic: text(120, "The topic"),
  links: z.strictObject({
    linkedin: optionalLink, github: optionalLink, x: optionalLink, instagram: optionalLink, website: optionalLink,
  }),
});

export const GallerySchema = z.strictObject({
  imageUrl: https(600),
  caption: text(140, "The caption"),
  alt: trimmed(3, 200, "The alt text"),
  ratio: z.enum(["tall", "wide", "square"]),
  eventId: z.uuid().nullable(),
});

export const SponsorSchema = z.strictObject({
  name: trimmed(1, 80, "The name"),
  url: optionalLink,
  logoUrl: imageUrl,
  tier: trimmed(1, 40, "The tier"),
  tierSize: z.enum(["xl", "lg", "md", "sm"]),
});

export const TeamMemberSchema = z.strictObject({
  name: trimmed(2, 80, "The name"),
  role: trimmed(1, 80, "The role"),
  group: trimmed(1, 60, "The group"),
  photoUrl: imageUrl,
  funFact: text(200, "The fun fact"),
  links: z.strictObject({ linkedin: optionalLink, instagram: optionalLink, github: optionalLink }),
});

export const FaqSchema = z.strictObject({
  question: trimmed(3, 200, "The question"),
  answer: trimmed(1, 1500, "The answer"),
});

export const TestimonialSchema = z.strictObject({
  quote: trimmed(3, 400, "The quote"),
  name: trimmed(2, 80, "The name"),
  detail: text(120, "The detail"),
  stepLabel: text(40, "The step label"),
  photoUrl: imageUrl,
});

/** Top-level `settings` keys the editor may change. name, siteUrl, gaId, venue, registration, newsletter, organizer
 *  and altTaglines stay SQL-only: a patch that names them is ignored, never merged. */
export const SETTINGS_EDITABLE = [
  "announcement", "tagline", "supportLine", "description", "contact", "social", "ieee",
  "aftermovieUrl", "sponsorDeckUrl", "speakerFormUrl", "volunteerFormUrl",
] as const;
export type SettingsEditableKey = (typeof SETTINGS_EDITABLE)[number];

export const SettingsPatchSchema = z.strictObject({
  announcement: z.strictObject({ enabled: z.boolean(), text: text(200, "The announcement") }),
  tagline: text(120, "The tagline"),
  supportLine: text(200, "The support line"),
  description: text(400, "The description"),
  contact: z.strictObject({
    email: z.union([z.literal(""), z.email("Enter a valid email address.").max(254)]),
    sponsorEmail: z.union([z.literal(""), z.email("Enter a valid email address.").max(254)]),
    coordinators: z
      .array(z.strictObject({ name: trimmed(1, 80, "The name"), role: text(80, "The role"), phone: text(30, "The phone") }))
      .max(10, "At most 10 coordinators."),
  }),
  social: z.strictObject({
    instagram: optionalLink, linkedin: optionalLink, whatsapp: optionalLink, youtube: optionalLink, github: optionalLink,
  }),
  ieee: z.strictObject({ joinUrl: optionalLink, branchUrl: optionalLink }),
  aftermovieUrl: optionalLink,
  sponsorDeckUrl: optionalLink,
  speakerFormUrl: optionalLink,
  volunteerFormUrl: optionalLink,
});

/** Only whitelisted keys survive; everything else in the raw patch is dropped before validation. */
export function pickSettingsPatch(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const k of SETTINGS_EDITABLE) if (k in raw) out[k] = (raw as Record<string, unknown>)[k];
  return out;
}

export const StatsInputSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        label: trimmed(1, 40, "The label"),
        value: z.number().int().min(0).max(10_000_000),
        suffix: text(8, "The suffix"),
      }),
    )
    .max(8, "At most 8 numbers."),
});
