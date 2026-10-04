import { event } from "@/data/event";
import type { Weekend } from "@/data/types";

/** schema.org Event for one weekend. */
export function eventJsonLd(w: Weekend) {
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
    url: `${event.siteUrl}/weekend/${w.slug}`,
    image: [`${event.siteUrl}/weekend/${w.slug}/opengraph-image`],
    location: {
      "@type": "Place",
      name: event.venue.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: event.venue.address,
        addressLocality: event.venue.city,
        addressRegion: event.venue.region,
        postalCode: event.venue.postalCode,
        addressCountry: event.venue.country,
      },
    },
    organizer: { "@type": "Organization", name: event.organizer.name, url: event.organizer.url },
    offers: {
      "@type": "Offer",
      url: `${event.siteUrl}/register?step=${w.slug}`,
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
