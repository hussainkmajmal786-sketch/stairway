import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { EVENT_SELECT, rowToEventView, type EventRow } from "@/lib/events/mappers";
import type { SocietyColor } from "@/lib/events/types";
import { SettingsSchema, StatsSchema } from "./schema";
import type { SiteData, SponsorTierView } from "./types";

const orThrow = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error || r.data === null) throw new Error(`Failed to load ${what}: ${r.error?.message ?? "no data"}`);
  return r.data;
};

/** All public site data, loaded once per request. RLS hides drafts from anonymous reads. */
export const getSiteData = cache(async (): Promise<SiteData> => {
  const db = createPublicClient();
  const [blocks, societies, events, seats, speakers, sponsors, team, faqs, testimonials, gallery] = await Promise.all([
    db.from("site_blocks").select("key, data"),
    db.from("societies").select("id, slug, name, short_name, description, color, logo_url, tracks(id, name, description, sort_order)").order("sort_order"),
    db.from("events").select(EVENT_SELECT).eq("status", "published").order("starts_at"),
    db.from("event_seat_counts").select("event_id, seats_taken, attending"),
    db.from("speakers").select("slug, name, designation, organization, photo_url, bio, topic, links").order("sort_order"),
    db.from("sponsors").select("name, url, logo_url, tier, tier_size").order("sort_order"),
    db.from("team_members").select('name, role, "group", photo_url, fun_fact, links').order("sort_order"),
    db.from("faqs").select("question, answer").order("sort_order"),
    db.from("testimonials").select("quote, name, detail, step_label, photo_url").order("sort_order"),
    db.from("gallery_items").select("id, image_url, caption, alt, ratio, event:events(slug, title, step_number)").order("sort_order"),
  ]);

  const blockMap = new Map(orThrow(blocks, "site_blocks").map((b) => [b.key, b.data]));
  const seatMap = new Map(orThrow(seats, "seat counts").map((s) => [s.event_id, s.seats_taken ?? 0]));
  const attendingMap = new Map(orThrow(seats, "seat counts").map((s) => [s.event_id, s.attending ?? 0]));

  const tiers = new Map<string, SponsorTierView>();
  for (const s of orThrow(sponsors, "sponsors")) {
    const t = tiers.get(s.tier) ?? { tier: s.tier, size: s.tier_size as SponsorTierView["size"], sponsors: [] };
    t.sponsors.push({ name: s.name, url: s.url, logo: s.logo_url ?? undefined });
    tiers.set(s.tier, t);
  }

  return {
    settings: SettingsSchema.parse(blockMap.get("settings")),
    stats: StatsSchema.parse(blockMap.get("stats") ?? { items: [] }).items,
    societies: orThrow(societies, "societies").map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      shortName: s.short_name,
      description: s.description,
      color: s.color as SocietyColor,
      logoUrl: s.logo_url,
      tracks: [...(s.tracks ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => ({ id: t.id, name: t.name, description: t.description })),
    })),
    events: (orThrow(events, "events") as unknown as EventRow[]).map((r) => rowToEventView(r, seatMap.get(r.id) ?? 0, attendingMap.get(r.id) ?? 0)),
    speakers: orThrow(speakers, "speakers").map((s) => ({
      id: s.slug,
      name: s.name,
      designation: s.designation,
      organization: s.organization,
      photo: s.photo_url ?? undefined,
      bio: s.bio,
      topic: s.topic,
      links: (s.links ?? {}) as SiteData["speakers"][number]["links"],
    })),
    sponsors: [...tiers.values()],
    team: orThrow(team, "team").map((m) => ({
      name: m.name,
      role: m.role,
      group: m.group,
      photo: m.photo_url ?? undefined,
      funFact: m.fun_fact,
      links: (m.links ?? {}) as SiteData["team"][number]["links"],
    })),
    faqs: orThrow(faqs, "faqs").map((f) => ({ q: f.question, a: f.answer })),
    testimonials: orThrow(testimonials, "testimonials").map((t) => ({
      quote: t.quote, name: t.name, detail: t.detail, step: t.step_label, photo: t.photo_url ?? undefined,
    })),
    gallery: orThrow(gallery, "gallery").map((g) => {
      const ev = g.event as { slug: string; title: string; step_number: number } | null;
      return {
        id: g.id,
        eventSlug: ev?.slug ?? null,
        eventTitle: ev?.title ?? null,
        step: ev?.step_number ?? null,
        caption: g.caption,
        alt: g.alt,
        src: g.image_url ?? undefined,
        ratio: g.ratio as "tall" | "wide" | "square",
      };
    }),
  };
});
