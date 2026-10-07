import { describe, expect, it } from "vitest";
import type { EventView } from "@/lib/events/types";
import { offerAvailability } from "@/lib/jsonld";

const ev = (slug: string, start: string, end: string, p: Partial<EventView> = {}): EventView => ({
  id: slug, slug, step: 1, title: slug, topic: "", summary: "", description: "", start, end, venue: "", mode: "offline",
  posterUrl: null, videoUrl: null, level: "Beginner", formats: [], agenda: [], outcomes: [], prerequisites: [], bring: [],
  seatsTotal: 10, seatsFilled: 3, pricePaise: 0, ticketType: "qr", tokenPrefix: "", isFinale: false, speakerIds: [],
  registrationOpensAt: null, registrationClosesAt: null,
  resources: {}, winners: [], trackName: null,
  society: { id: "main", slug: "main", name: "main", shortName: "main", color: "yellow" },
  ...p,
});

const NOW = Date.parse("2026-10-07T12:00:00+05:30");
const past = ev("past-step", "2026-09-01T09:00:00+05:30", "2026-09-01T16:00:00+05:30");
const soon = ev("seeing-machines", "2026-10-10T09:30:00+05:30", "2026-10-10T16:00:00+05:30");

describe("offerAvailability", () => {
  const S = "https://schema.org/";
  it("is in stock with plenty of seats while registration is open", () => expect(offerAvailability(soon, NOW)).toBe(`${S}InStock`));
  it("is limited when fewer than 20% of seats are left", () =>
    expect(offerAvailability({ ...soon, seatsFilled: 9 }, NOW)).toBe(`${S}LimitedAvailability`));
  it("is sold out when full or closed", () => {
    expect(offerAvailability({ ...soon, seatsFilled: 10 }, NOW)).toBe(`${S}SoldOut`);
    expect(offerAvailability(past, NOW)).toBe(`${S}SoldOut`);
    expect(offerAvailability({ ...soon, registrationClosesAt: "2026-10-01T00:00:00+05:30" }, NOW)).toBe(`${S}SoldOut`);
  });
  it("is a pre-order before registration opens", () =>
    expect(offerAvailability({ ...soon, registrationOpensAt: "2026-10-08T09:00:00+05:30" }, NOW)).toBe(`${S}PreOrder`));
});
