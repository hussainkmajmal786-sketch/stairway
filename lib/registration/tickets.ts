import type { SocietyColor } from "@/lib/events/types";
import { formatToken } from "@/lib/tickets/token";
import type { RegistrationStatus } from "./types";

/** Registrations select with the event (RLS hides unpublished events, which then come back as null). */
export const TICKET_SELECT =
  "id, status, waitlist_position, ticket_code, token_number, checked_in_at, event:events(id, slug, title, topic, step_number, starts_at, ends_at, price_paise, ticket_type, token_prefix, society:societies(short_name, color))";

export interface TicketRow {
  id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string;
  token_number: number | null;
  checked_in_at: string | null;
  event: {
    id: string;
    slug: string;
    title: string;
    topic: string;
    step_number: number;
    starts_at: string;
    ends_at: string;
    price_paise: number;
    ticket_type: "qr" | "token";
    token_prefix: string;
    society: { short_name: string; color: string } | null;
  } | null;
}

export interface TicketSummary {
  id: string;
  status: RegistrationStatus;
  waitlistPosition: number | null;
  /** Door token (confirmed seats only). */
  token: string | null;
  ticketType: "qr" | "token";
  event: {
    id: string;
    slug: string;
    title: string;
    topic: string;
    step: number;
    start: string;
    end: string;
    pricePaise: number;
    societyShort: string;
    societyColor: SocietyColor;
  };
}

export interface TicketDetail extends TicketSummary {
  ticketCode: string;
  checkedInAt: string | null;
}

/** Null when RLS hides the event (e.g. unpublished) or its society: such tickets are not shown. */
export function rowToTicket(r: TicketRow): TicketDetail | null {
  const e = r.event;
  if (!e || !e.society) return null;
  return {
    id: r.id,
    status: r.status,
    waitlistPosition: r.waitlist_position,
    // A waitlisted re-registration may keep its old token_number in the DB; it is only a token once confirmed.
    token: r.status === "confirmed" && r.token_number != null ? formatToken(e.token_prefix, r.token_number) : null,
    ticketType: e.ticket_type,
    ticketCode: r.ticket_code,
    checkedInAt: r.checked_in_at,
    event: {
      id: e.id,
      slug: e.slug,
      title: e.title,
      topic: e.topic,
      step: e.step_number,
      start: e.starts_at,
      end: e.ends_at,
      pricePaise: e.price_paise,
      societyShort: e.society.short_name,
      // societies.color has a CHECK constraint matching SocietyColor.
      societyColor: e.society.color as SocietyColor,
    },
  };
}

/** Drops the ticket code (and check-in time) so lists never carry the QR secret. */
export function toSummary(t: TicketDetail): TicketSummary {
  return {
    id: t.id,
    status: t.status,
    waitlistPosition: t.waitlistPosition,
    token: t.token,
    ticketType: t.ticketType,
    event: t.event,
  };
}

const startOf = (t: TicketSummary) => Date.parse(t.event.start);

/** Upcoming = not yet ended (soonest first, so a running event comes first); past = ended (most recent first). */
export function splitTickets<T extends TicketSummary>(list: readonly T[], now: number): { upcoming: T[]; past: T[] } {
  const upcoming = list.filter((t) => !(Date.parse(t.event.end) < now)).sort((a, b) => startOf(a) - startOf(b));
  const past = list.filter((t) => Date.parse(t.event.end) < now).sort((a, b) => startOf(b) - startOf(a));
  return { upcoming, past };
}

export function nextTicket<T extends TicketSummary>(list: readonly T[], now: number): T | null {
  return splitTickets(list, now).upcoming[0] ?? null;
}
