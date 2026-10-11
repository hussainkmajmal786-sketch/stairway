import type { z } from "zod";
import {
  FaqSchema, GallerySchema, SpeakerSchema, SponsorSchema, TeamMemberSchema, TestimonialSchema, TrackSchema,
} from "./content-schemas";

/**
 * The whitelist of editable site entities. Table and column names live ONLY here: the client sends the enum value
 * and nothing else decides which table is written. Pure data (importable by tests and the UI).
 */
export const ENTITIES = ["track", "speaker", "gallery", "sponsor", "team", "faq", "testimonial"] as const;
export type Entity = (typeof ENTITIES)[number];

export interface EntityRule {
  table: "tracks" | "speakers" | "gallery_items" | "sponsors" | "team_members" | "faqs" | "testimonials";
  /** society: scoped by `society_id`; super: super admins only. A speaker is society-scoped only while society_id is set. */
  scope: "society" | "super";
  /** Society column for society-scoped tables (null society = shared row = super only). */
  societyColumn?: "society_id";
  schema: z.ZodType<Record<string, unknown>>;
  /** Maps validated camelCase input to database columns. The society column is never part of an update. */
  toRow: (d: Record<string, unknown>) => Record<string, unknown>;
  /** Input keys that hold an uploaded-image URL (checked with isOwnMediaUrl). */
  imageKeys: readonly string[];
  /** Order column, when the list can be reordered. */
  sortable: boolean;
}

const s = <T extends z.ZodType>(schema: T) => schema as unknown as z.ZodType<Record<string, unknown>>;

export const ENTITY_RULES: Record<Entity, EntityRule> = {
  track: {
    table: "tracks", scope: "society", societyColumn: "society_id", schema: s(TrackSchema), sortable: true, imageKeys: [],
    toRow: (d) => ({ name: d.name, description: d.description }),
  },
  speaker: {
    table: "speakers", scope: "society", societyColumn: "society_id", schema: s(SpeakerSchema), sortable: true,
    imageKeys: ["photoUrl"],
    toRow: (d) => ({
      slug: d.slug, name: d.name, designation: d.designation, organization: d.organization, photo_url: d.photoUrl,
      bio: d.bio, topic: d.topic, links: compactLinks(d.links),
    }),
  },
  gallery: {
    table: "gallery_items", scope: "society", societyColumn: "society_id", schema: s(GallerySchema), sortable: true,
    imageKeys: ["imageUrl"],
    toRow: (d) => ({ image_url: d.imageUrl, caption: d.caption, alt: d.alt, ratio: d.ratio, event_id: d.eventId }),
  },
  sponsor: {
    table: "sponsors", scope: "super", schema: s(SponsorSchema), sortable: true, imageKeys: ["logoUrl"],
    toRow: (d) => ({ name: d.name, url: d.url, logo_url: d.logoUrl, tier: d.tier, tier_size: d.tierSize }),
  },
  team: {
    table: "team_members", scope: "super", schema: s(TeamMemberSchema), sortable: true, imageKeys: ["photoUrl"],
    toRow: (d) => ({
      name: d.name, role: d.role, group: d.group, photo_url: d.photoUrl, fun_fact: d.funFact, links: compactLinks(d.links),
    }),
  },
  faq: {
    table: "faqs", scope: "super", schema: s(FaqSchema), sortable: true, imageKeys: [],
    toRow: (d) => ({ question: d.question, answer: d.answer }),
  },
  testimonial: {
    table: "testimonials", scope: "super", schema: s(TestimonialSchema), sortable: true, imageKeys: ["photoUrl"],
    toRow: (d) => ({ quote: d.quote, name: d.name, detail: d.detail, step_label: d.stepLabel, photo_url: d.photoUrl }),
  },
};

/** Empty link strings are dropped so stored JSON stays minimal. */
function compactLinks(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) if (typeof val === "string" && val !== "") out[k] = val;
  }
  return out;
}

export function isEntity(v: unknown): v is Entity {
  return typeof v === "string" && (ENTITIES as readonly string[]).includes(v);
}

/** Folder an uploaded image must live in: the row's society folder, or `site/` for site-wide rows. */
export function imagePrefix(societyId: string | null): string {
  return societyId ? `societies/${societyId}/` : "site/";
}

/** Public paths that show these entities. */
export function entityPublicPaths(entity: Entity): string[] {
  switch (entity) {
    case "gallery": return ["/gallery", "/"];
    case "track":
    case "speaker": return ["/", "/events"];
    default: return ["/"];
  }
}
