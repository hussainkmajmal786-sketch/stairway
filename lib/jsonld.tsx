import type { EventView } from "@/lib/events/types";
import type { Settings } from "@/lib/site/schema";
import { registrationWindow } from "@/lib/registration/cta";

const SCHEMA = "https://schema.org/";

/** schema.org availability from the registration window and the public seat count. */
export function offerAvailability(w: EventView, now: number) {
  const win = registrationWindow(w, now);
  const left = Math.max(0, w.seatsTotal - w.seatsFilled);
  if (win === "closed" || left === 0) return `${SCHEMA}SoldOut`;
  if (win === "not_open") return `${SCHEMA}PreOrder`;
  return left / Math.max(1, w.seatsTotal) < 0.2 ? `${SCHEMA}LimitedAvailability` : `${SCHEMA}InStock`;
}

/** schema.org Event for one weekend. */
export function eventJsonLd(w: EventView, settings: Settings, now: number) {
  const eventUrl = `${settings.siteUrl}/events/${w.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: `st(AI)rway Step ${String(w.step).padStart(2, "0")}: ${w.title} — ${w.topic}`,
    description: w.description,
    startDate: w.start,
    endDate: w.end,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: eventUrl,
    image: [`${settings.siteUrl}/events/${w.slug}/opengraph-image`],
    location: {
      "@type": "Place",
      name: settings.venue.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: settings.venue.address,
        addressLocality: settings.venue.city,
        addressRegion: settings.venue.region,
        postalCode: settings.venue.postalCode,
        addressCountry: settings.venue.country,
      },
    },
    organizer: { "@type": "Organization", name: settings.organizer.name, url: settings.organizer.url },
    offers: {
      "@type": "Offer",
      // The event page carries the registration button (sign-in, form, waitlist or the external form).
      url: eventUrl,
      price: (w.pricePaise / 100).toFixed(2).replace(/\.00$/, ""),
      priceCurrency: "INR",
      availability: offerAvailability(w, now),
      validFrom: w.registrationOpensAt ?? "2026-08-01T00:00:00+05:30",
    },
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
