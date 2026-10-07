import { z } from "zod";

const link = z.string();

export const SettingsSchema = z.object({
  name: z.string().min(1),
  tagline: z.string(),
  supportLine: z.string(),
  altTaglines: z.array(z.string()),
  description: z.string(),
  siteUrl: z.url(),
  organizer: z.object({ name: z.string(), short: z.string(), url: link }),
  venue: z.object({
    name: z.string(), hall: z.string(), address: z.string(), city: z.string(), region: z.string(),
    country: z.string(), postalCode: z.string(), mapEmbed: link, mapLink: link,
  }),
  registration: z.object({ mode: z.enum(["onsite", "external"]), googleFormUrl: link, endpoint: z.string() }),
  newsletter: z.object({ endpoint: z.string() }),
  // GA4 / Google tag / Ads / UA id, or "" (off). Anything else reads as "" so a typo disables GA instead of the site.
  gaId: z.union([z.literal(""), z.string().regex(/^(G|GT|AW|UA)-[A-Z0-9-]+$/)]).catch(""),
  announcement: z.object({ enabled: z.boolean(), text: z.string() }),
  aftermovieUrl: link,
  sponsorDeckUrl: z.string(),
  speakerFormUrl: link,
  volunteerFormUrl: link,
  contact: z.object({
    email: z.string(),
    sponsorEmail: z.string(),
    coordinators: z.array(z.object({ name: z.string(), role: z.string(), phone: z.string() })),
  }),
  social: z.object({ instagram: link, linkedin: link, whatsapp: link, youtube: link, github: link }),
  ieee: z.object({ joinUrl: link, branchUrl: link }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const StatsSchema = z.object({
  items: z.array(z.object({ label: z.string(), value: z.number(), suffix: z.string() })),
});
