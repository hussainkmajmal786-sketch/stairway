import { describe, expect, it } from "vitest";
import { rowToEventView, type EventRow } from "@/lib/events/mappers";

const row: EventRow = {
  id: "e1", slug: "seeing-machines", step_number: 1, title: "Seeing Machines", topic: "CV", summary: "s", description: "d",
  starts_at: "2026-10-10T04:00:00+00:00", ends_at: "2026-10-10T11:00:00+00:00", venue: "Hall A", mode: "offline",
  poster_url: null, video_url: "https://youtu.be/x", level: "Intermediate", formats: ["Lab"],
  agenda: [{ time: "09:30", title: "Check-in" }], outcomes: ["o"], prerequisites: [], bring: [],
  capacity: 60, price_paise: 9900, ticket_type: "token", token_prefix: "RAS-01",
  registration_opens_at: "2026-10-01T09:00:00+05:30", registration_closes_at: null, is_finale: false,
  resources: { slides: "https://x" }, winners: [],
  society: { id: "s1", slug: "ras", name: "IEEE RAS", short_name: "RAS", color: "green" },
  track: { name: "AI × Computer Vision" },
  event_speakers: [{ sort_order: 1, speaker: { slug: "b" } }, { sort_order: 0, speaker: { slug: "a" } }],
};

describe("rowToEventView", () => {
  const v = rowToEventView(row, 12);
  it("maps columns to view fields", () => {
    expect(v.step).toBe(1);
    expect(v.start).toBe("2026-10-10T04:00:00+00:00");
    expect(v.pricePaise).toBe(9900);
    expect(v.ticketType).toBe("token");
    expect(v.society).toEqual({ id: "s1", slug: "ras", name: "IEEE RAS", shortName: "RAS", color: "green" });
    expect(v.trackName).toBe("AI × Computer Vision");
    expect(v.registrationOpensAt).toBe("2026-10-01T09:00:00+05:30");
    expect(v.registrationClosesAt).toBeNull();
  });
  it("orders speakers and sets seat counts", () => {
    expect(v.speakerIds).toEqual(["a", "b"]);
    expect(v.seatsTotal).toBe(60);
    expect(v.seatsFilled).toBe(12);
  });
  it("tolerates null track and non-array jsonb", () => {
    const w = rowToEventView({ ...row, track: null, agenda: null, winners: {}, resources: null }, 0);
    expect(w.trackName).toBeNull();
    expect(w.agenda).toEqual([]);
    expect(w.winners).toEqual([]);
    expect(w.resources).toEqual({});
  });
  it("throws when society is missing", () => {
    expect(() => rowToEventView({ ...row, society: null }, 0)).toThrow();
  });
});
