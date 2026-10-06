import { describe, expect, it } from "vitest";
import { REGISTRATION_CONFIG } from "@/supabase/seed-data/registration";
import { EVENT_SOCIETY_MAP } from "@/supabase/seed-data/event-map";
import { WIE_EVENTS } from "@/supabase/seed-data/wie-events";
import { QuestionsSchema } from "@/lib/registration/questions";

describe("REGISTRATION_CONFIG", () => {
  const slugs = new Set([...Object.keys(EVENT_SOCIETY_MAP), ...WIE_EVENTS.map((w) => w.slug)]);
  it("only configures events that exist", () => {
    for (const slug of Object.keys(REGISTRATION_CONFIG)) expect(slugs.has(slug)).toBe(true);
  });
  it("only contains questions the database will accept", () => {
    for (const c of Object.values(REGISTRATION_CONFIG))
      if (c.questions) expect(QuestionsSchema.safeParse(c.questions).success).toBe(true);
  });
  it("uses ISO timestamps with an offset", () => {
    for (const c of Object.values(REGISTRATION_CONFIG))
      if (c.opensAt) expect(c.opensAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});
