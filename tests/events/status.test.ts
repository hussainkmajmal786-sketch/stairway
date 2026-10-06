import { describe, expect, it } from "vitest";
import { nextForSociety, nextOverall, pickNext, societyStairway, withStatus } from "@/lib/events/status";
import type { EventView } from "@/lib/events/types";

const ev = (slug: string, society: string, step: number, start: string, end: string): EventView => ({
  id: slug, slug, step, title: slug, topic: "", summary: "", description: "", start, end, venue: "", mode: "offline",
  posterUrl: null, videoUrl: null, level: "Beginner", formats: [], agenda: [], outcomes: [], prerequisites: [], bring: [],
  seatsTotal: 10, seatsFilled: 3, pricePaise: 0, ticketType: "qr", tokenPrefix: "", isFinale: false, speakerIds: [],
  registrationOpensAt: null, registrationClosesAt: null,
  resources: {}, winners: [], trackName: null,
  society: { id: society, slug: society, name: society, shortName: society, color: "yellow" },
});

const NOW = new Date("2026-10-04T12:00:00+05:30").getTime();
const list = [
  ev("m1", "main", 1, "2026-09-01T09:00:00+05:30", "2026-09-01T16:00:00+05:30"),
  ev("m2", "main", 2, "2026-10-24T09:00:00+05:30", "2026-10-24T16:00:00+05:30"),
  ev("m3", "main", 3, "2026-11-07T09:00:00+05:30", "2026-11-07T16:00:00+05:30"),
  ev("r1", "ras", 1, "2026-10-10T09:00:00+05:30", "2026-10-10T16:00:00+05:30"),
  ev("r2", "ras", 2, "2026-12-01T09:00:00+05:30", "2026-12-01T16:00:00+05:30"),
];

describe("withStatus", () => {
  const s = withStatus(list, NOW);
  const by = (slug: string) => s.find((e) => e.slug === slug)!;

  it("computes status independently per society", () => {
    expect(by("m1").status).toBe("completed");
    expect(by("m2").status).toBe("next");
    expect(by("m3").status).toBe("upcoming");
    expect(by("r1").status).toBe("next");
    expect(by("r2").status).toBe("upcoming");
  });
  it("adds seatsLeft", () => {
    expect(by("m2").seatsLeft).toBe(7);
  });
  it("finds the next session overall and per society", () => {
    expect(nextOverall(s)?.slug).toBe("r1");
    expect(nextForSociety(s, "main")?.slug).toBe("m2");
    expect(nextForSociety(s, "wie")).toBeUndefined();
  });
  it("orders a society stairway by step", () => {
    expect(societyStairway(s, "main").map((e) => e.step)).toEqual([1, 2, 3]);
  });
  it("has no next when every event in a society is completed", () => {
    const done = withStatus(list, new Date("2027-01-01T00:00:00+05:30").getTime());
    expect(done.every((e) => e.status === "completed")).toBe(true);
    expect(nextForSociety(done, "main")).toBeUndefined();
    expect(nextOverall(done)).toBeUndefined();
  });
});

describe("pickNext", () => {
  it("returns null when nothing is published", () => {
    expect(pickNext([])).toBeNull();
  });

  it("returns the soonest next event", () => {
    const s = withStatus(list, NOW);
    expect(pickNext(s)?.slug).toBe("r1");
  });

  it("falls back to the last event when everything is completed", () => {
    const s = withStatus(list, new Date("2027-01-01T00:00:00+05:30").getTime());
    expect(s.every((e) => e.status === "completed")).toBe(true);
    expect(pickNext(s)?.slug).toBe("r2");
  });
});
