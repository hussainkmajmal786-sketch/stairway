import type { AgendaItem, EventResources, EventView, SocietyColor } from "./types";

/** Shape returned by the events select in `lib/site/load.ts` (EVENT_SELECT). */
export interface EventRow {
  id: string;
  slug: string;
  step_number: number;
  title: string;
  topic: string;
  summary: string;
  description: string;
  starts_at: string;
  ends_at: string;
  venue: string;
  mode: "offline" | "online" | "hybrid";
  poster_url: string | null;
  video_url: string | null;
  level: string;
  formats: string[];
  agenda: unknown;
  outcomes: string[];
  prerequisites: string[];
  bring: string[];
  capacity: number;
  price_paise: number;
  ticket_type: "qr" | "token";
  token_prefix: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  is_finale: boolean;
  resources: unknown;
  winners: unknown;
  society: { id: string; slug: string; name: string; short_name: string; color: string } | null;
  track: { name: string } | null;
  event_speakers: { sort_order: number; speaker: { slug: string } | null }[];
}

export const EVENT_SELECT =
  "id, slug, step_number, title, topic, summary, description, starts_at, ends_at, venue, mode, poster_url, video_url, level, formats, agenda, outcomes, prerequisites, bring, capacity, price_paise, ticket_type, token_prefix, registration_opens_at, registration_closes_at, is_finale, resources, winners, society:societies(id, slug, name, short_name, color), track:tracks(name), event_speakers(sort_order, speaker:speakers(slug))";

export function rowToEventView(r: EventRow, seatsTaken: number, attending: number = seatsTaken): EventView {
  if (!r.society) throw new Error(`Event ${r.slug} has no society`);
  return {
    id: r.id,
    slug: r.slug,
    step: r.step_number,
    title: r.title,
    topic: r.topic,
    summary: r.summary,
    description: r.description,
    start: r.starts_at,
    end: r.ends_at,
    venue: r.venue,
    mode: r.mode,
    posterUrl: r.poster_url,
    videoUrl: r.video_url,
    level: r.level,
    formats: r.formats,
    agenda: (Array.isArray(r.agenda) ? r.agenda : []) as AgendaItem[],
    outcomes: r.outcomes,
    prerequisites: r.prerequisites,
    bring: r.bring,
    seatsTotal: r.capacity,
    seatsFilled: seatsTaken,
    attending,
    pricePaise: r.price_paise,
    ticketType: r.ticket_type,
    tokenPrefix: r.token_prefix,
    registrationOpensAt: r.registration_opens_at,
    registrationClosesAt: r.registration_closes_at,
    isFinale: r.is_finale,
    speakerIds: [...r.event_speakers]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => s.speaker?.slug)
      .filter((s): s is string => !!s),
    resources: (r.resources ?? {}) as EventResources,
    winners: (Array.isArray(r.winners) ? r.winners : []) as EventView["winners"],
    society: {
      id: r.society.id,
      slug: r.society.slug,
      name: r.society.name,
      shortName: r.society.short_name,
      color: r.society.color as SocietyColor,
    },
    trackName: r.track?.name ?? null,
  };
}
