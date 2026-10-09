import { describe, expect, it } from "vitest";
import { ghostWord } from "@/lib/design/ghost";
import { EVENT_SOCIETY_MAP } from "@/supabase/seed-data/event-map";
import { WIE_EVENTS } from "@/supabase/seed-data/wie-events";

// Every seeded session (the 12 mapped ones plus the WIE stairway, which carries its own step numbers).
const SESSIONS: Record<string, { step: number; finale: boolean }> = {
  ...Object.fromEntries(Object.entries(EVENT_SOCIETY_MAP).map(([slug, e]) => [slug, { step: e.step, finale: !!e.finale }])),
  ...Object.fromEntries(WIE_EVENTS.map((e) => [e.slug, { step: e.step, finale: false }])),
};

describe("session ghost words for the seeded sessions", () => {
  const ghost = (slug: string) => {
    const e = SESSIONS[slug];
    return ghostWord({ kind: "session", step: e.step, finale: e.finale });
  };

  it("labels ordinary sessions STEP NN", () => {
    expect(ghost("seeing-machines")).toBe("STEP 01");
    expect(ghost("wie-lead-with-ai")).toBe("STEP 04");
  });

  it("labels the finale SUMMIT, and only the finale", () => {
    expect(ghost("the-summit")).toBe("SUMMIT");
    expect(Object.keys(SESSIONS).filter((s) => ghost(s) === "SUMMIT")).toEqual(["the-summit"]);
  });

  it("never yields an empty or unpadded word for any seeded session", () => {
    expect(Object.keys(SESSIONS)).toHaveLength(16);
    for (const slug of Object.keys(SESSIONS)) expect(ghost(slug)).toMatch(/^(STEP \d{2,}|SUMMIT)$/);
  });
});
