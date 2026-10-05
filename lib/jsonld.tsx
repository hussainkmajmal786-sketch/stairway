import type { EventView } from "@/lib/events/types";
import type { Settings } from "@/lib/site/schema";

/** schema.org Event for one weekend. */
export function eventJsonLd(w: EventView, settings: Settings) {
  const ended = new Date(w.end).getTime() < Date.now();
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: `st(AI)rway Step ${String(w.step).padStart(2, "0")}: ${w.title} — ${w.topic}`,
    description: w.description,
    startDate: w.start,
    endDate: w.end,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: `${settings.siteUrl}/events/${w.slug}`,
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
      url: `${settings.siteUrl}/register?step=${w.slug}`,
      price: "0",
      priceCurrency: "INR",
      availability: ended || w.seatsFilled >= w.seatsTotal ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      validFrom: "2026-08-01T00:00:00+05:30",
    },
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
