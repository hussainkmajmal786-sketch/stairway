import { describe, expect, it } from "vitest";
import type { EventView } from "@/lib/events/types";
import { eventJsonLd, JsonLd, offerAvailability } from "@/lib/jsonld";
import type { Settings } from "@/lib/site/schema";

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

const settings = {
  siteUrl: "https://example.org",
  venue: { name: "Hall", address: "1 Road", city: "Kidangoor", region: "KL", postalCode: "686000", country: "IN" },
  organizer: { name: "IEEE SB CEK", url: "https://example.org/ieee" },
} as unknown as Settings;

describe("eventJsonLd offers", () => {
  it("describes a free open session", () => {
    const { offers } = eventJsonLd(soon, settings, NOW);
    expect(offers).toMatchObject({
      "@type": "Offer",
      url: "https://example.org/events/seeing-machines",
      price: "0",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
    });
  });
  it("formats a paid price in rupees", () => {
    expect(eventJsonLd({ ...soon, pricePaise: 49950 }, settings, NOW).offers.price).toBe("499.50");
    expect(eventJsonLd({ ...soon, pricePaise: 50000 }, settings, NOW).offers.price).toBe("500");
  });
  it("uses the real registration opening time as validFrom", () => {
    const opens = "2026-10-08T09:00:00+05:30";
    expect(eventJsonLd({ ...soon, registrationOpensAt: opens }, settings, NOW).offers).toMatchObject({
      validFrom: opens,
      availability: "https://schema.org/PreOrder",
    });
  });
  it("omits validFrom when registration has no opening time", () => {
    expect("validFrom" in eventJsonLd(soon, settings, NOW).offers).toBe(false);
  });
});

describe("JsonLd", () => {
  it("escapes < so content cannot close the script tag", () => {
    const el = JsonLd({ data: { name: "</script><script>alert(1)</script>" } });
    const html = el.props.dangerouslySetInnerHTML.__html as string;
    expect(html).not.toContain("<");
    expect(html).toContain("\\u003c/script>");
    expect(JSON.parse(html).name).toBe("</script><script>alert(1)</script>");
  });
});
