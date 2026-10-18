import { describe, expect, it } from "vitest";
import {
  FaqSchema, GallerySchema, pickSettingsPatch, SETTINGS_EDITABLE, SettingsPatchSchema, SocietyEditSchema,
  SocietyIdentitySchema, SpeakerSchema, SponsorSchema, StatsInputSchema, TeamMemberSchema, TestimonialSchema, TrackSchema,
} from "@/lib/admin/content-schemas";
import { ENTITIES, ENTITY_RULES, imagePrefix, isEntity } from "@/lib/admin/entities";
import { SettingsSchema } from "@/lib/site/schema";

const EVT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const speaker = {
  slug: "asha-k", name: "Asha K", designation: "Engineer", organization: "ACME", photoUrl: null, bio: "Hi", topic: "RAG",
  links: { linkedin: "", github: "", x: "", instagram: "", website: "" },
};

describe("URL fields are https only", () => {
  it.each(["javascript:alert(1)", "http://example.com", "//example.com", "data:text/html,x", "ftp://x.y"])("rejects %s", (u) => {
    expect(SpeakerSchema.safeParse({ ...speaker, links: { ...speaker.links, website: u } }).success).toBe(false);
    expect(SponsorSchema.safeParse({ name: "S", url: u, logoUrl: null, tier: "Gold", tierSize: "lg" }).success).toBe(false);
    expect(SocietyEditSchema.safeParse({ description: "", logoUrl: u }).success).toBe(false);
  });
  it("accepts https and the empty string for optional links", () => {
    expect(SpeakerSchema.safeParse({ ...speaker, links: { ...speaker.links, website: "https://a.dev/x" } }).success).toBe(true);
    expect(SpeakerSchema.safeParse(speaker).success).toBe(true);
  });
});

describe("limits and enums", () => {
  it("caps text lengths", () => {
    expect(SocietyEditSchema.safeParse({ description: "x".repeat(601), logoUrl: null }).success).toBe(false);
    expect(TrackSchema.safeParse({ name: "ab", description: "x".repeat(301) }).success).toBe(false);
    expect(FaqSchema.safeParse({ question: "Why?", answer: "x".repeat(1501) }).success).toBe(false);
    expect(TestimonialSchema.safeParse({ quote: "x".repeat(401), name: "Ann", detail: "", stepLabel: "", photoUrl: null }).success).toBe(false);
    expect(TeamMemberSchema.safeParse({ name: "Ann", role: "Lead", group: "Core", photoUrl: null, funFact: "x".repeat(201), links: { linkedin: "", instagram: "", github: "" } }).success).toBe(false);
  });
  it("restricts the colour, tier size and ratio enums", () => {
    expect(SocietyIdentitySchema.safeParse({ name: "RAS", shortName: "RAS", color: "pink", sortOrder: 1 }).success).toBe(false);
    expect(SocietyIdentitySchema.safeParse({ name: "RAS", shortName: "RAS", color: "green", sortOrder: 1 }).success).toBe(true);
    expect(SponsorSchema.safeParse({ name: "S", url: "", logoUrl: null, tier: "Gold", tierSize: "huge" }).success).toBe(false);
    expect(GallerySchema.safeParse({ imageUrl: "https://x.y/a.png", caption: "", alt: "ok text", ratio: "round", eventId: null }).success).toBe(false);
  });
  it("requires alt text of 3+ characters and an event uuid or null", () => {
    const base = { imageUrl: "https://x.y/a.png", caption: "", ratio: "wide" as const };
    expect(GallerySchema.safeParse({ ...base, alt: "ab", eventId: null }).success).toBe(false);
    expect(GallerySchema.safeParse({ ...base, alt: "abc", eventId: EVT }).success).toBe(true);
    expect(GallerySchema.safeParse({ ...base, alt: "abc", eventId: "nope" }).success).toBe(false);
  });
  it("validates the speaker slug and rejects unknown keys", () => {
    expect(SpeakerSchema.safeParse({ ...speaker, slug: "Bad Slug" }).success).toBe(false);
    expect(SpeakerSchema.safeParse({ ...speaker, society_id: "x" }).success).toBe(false);
  });
  it("stats are bounded", () => {
    expect(StatsInputSchema.safeParse({ items: [{ label: "Members", value: 120, suffix: "+" }] }).success).toBe(true);
    expect(StatsInputSchema.safeParse({ items: [{ label: "Members", value: -1, suffix: "" }] }).success).toBe(false);
    expect(StatsInputSchema.safeParse({ items: Array(9).fill({ label: "a", value: 1, suffix: "" }) }).success).toBe(false);
  });
});

describe("settings whitelist", () => {
  it("never includes the SQL-only keys", () => {
    for (const k of ["name", "siteUrl", "gaId", "venue", "registration", "newsletter", "organizer", "altTaglines"]) {
      expect(SETTINGS_EDITABLE as readonly string[], k).not.toContain(k);
      expect(Object.keys(SettingsPatchSchema.shape), k).not.toContain(k);
    }
  });
  it("every editable key is a real settings key", () => {
    for (const k of SETTINGS_EDITABLE) expect(Object.keys(SettingsSchema.shape)).toContain(k);
  });
  it("pickSettingsPatch drops everything outside the whitelist", () => {
    const out = pickSettingsPatch({ tagline: "Hi", siteUrl: "https://evil.example", gaId: "G-X", __proto__: { x: 1 }, venue: {} });
    expect(out).toEqual({ tagline: "Hi" });
    expect(pickSettingsPatch(null)).toEqual({});
    expect(pickSettingsPatch([1, 2])).toEqual({});
  });
  it("rejects a non-https social link and a bad email", () => {
    expect(SettingsPatchSchema.partial().safeParse({ social: { instagram: "http://x.y", linkedin: "", whatsapp: "", youtube: "", github: "" } }).success).toBe(false);
    expect(SettingsPatchSchema.partial().safeParse({ contact: { email: "nope", sponsorEmail: "", coordinators: [] } }).success).toBe(false);
  });
});

describe("entity rules", () => {
  it("has a rule for every entity and recognises only those", () => {
    for (const e of ENTITIES) expect(ENTITY_RULES[e]).toBeDefined();
    expect(isEntity("track")).toBe(true);
    expect(isEntity("profiles")).toBe(false);
    expect(isEntity("admin_roles")).toBe(false);
  });
  it("scopes: society entities vs super-only", () => {
    expect(ENTITIES.filter((e) => ENTITY_RULES[e].scope === "society").sort()).toEqual(["gallery", "speaker", "track"]);
    expect(ENTITIES.filter((e) => ENTITY_RULES[e].scope === "super").sort()).toEqual(["faq", "sponsor", "team", "testimonial"]);
  });
  it("never writes the society column or sort order from input", () => {
    for (const e of ENTITIES) {
      const cols = Object.keys(ENTITY_RULES[e].toRow({ ...speaker, name: "n", society_id: "x", societyId: "y", sort_order: 5, id: "i" }));
      expect(cols, e).not.toContain("society_id");
      expect(cols, e).not.toContain("sort_order");
      expect(cols, e).not.toContain("id");
    }
  });
  it("image prefix is the society folder or site/", () => {
    expect(imagePrefix("abc")).toBe("societies/abc/");
    expect(imagePrefix(null)).toBe("site/");
  });
});
