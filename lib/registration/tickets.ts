import type { SocietyColor } from "@/lib/events/types";
import { formatToken } from "@/lib/tickets/token";
import type { RegistrationStatus } from "./types";

/** Registrations select with the event (RLS hides unpublished events, which then come back as null). */
export const TICKET_SELECT =
  "id, status, waitlist_position, ticket_code, token_number, checked_in_at, amount_paise, hold_expires_at, receipt_number, paid_at, refunded_at, cancel_reason, event:events(id, slug, title, topic, step_number, starts_at, ends_at, price_paise, ticket_type, token_prefix, society:societies(short_name, color))";

/** Lists never select the ticket code (the QR secret). */
export const TICKET_LIST_SELECT = TICKET_SELECT.replace("ticket_code, ", "").replace("checked_in_at, ", "");

export interface TicketRow {
  id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string;
  token_number: number | null;
  checked_in_at: string | null;
  // Phase 4 payment columns (optional so Phase 3 shaped rows and fixtures still map).
  amount_paise?: number;
  hold_expires_at?: string | null;
  receipt_number?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  cancel_reason?: string | null;
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

export type TicketListRow = Omit<TicketRow, "ticket_code" | "checked_in_at">;

export interface TicketSummary {
  id: string;
  status: RegistrationStatus;
  waitlistPosition: number | null;
  /** Door token (confirmed seats only). */
  token: string | null;
  ticketType: "qr" | "token";
  /** Amount charged for this seat in paise (0 for free sessions). */
  amountPaise: number;
  /** End of a live payment hold (pending_payment only), else null. */
  holdExpiresAt: string | null;
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
  receiptNumber: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  cancelReason: string | null;
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
    amountPaise: r.amount_paise ?? 0,
    holdExpiresAt: r.status === "pending_payment" ? r.hold_expires_at ?? null : null,
    receiptNumber: r.receipt_number ?? null,
    paidAt: r.paid_at ?? null,
    refundedAt: r.refunded_at ?? null,
    cancelReason: r.cancel_reason ?? null,
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

/** Maps a list row (selected without the ticket code) to a summary; null when RLS hides the event. */
export function rowToSummary(r: TicketListRow): TicketSummary | null {
  const t = rowToTicket({ ...r, ticket_code: "", checked_in_at: null });
  return t && toSummary(t);
}

/** Drops the ticket code (and check-in time, receipt and refund details) so lists never carry the QR secret. */
export function toSummary(t: TicketDetail): TicketSummary {
  return {
    id: t.id,
    status: t.status,
    waitlistPosition: t.waitlistPosition,
    token: t.token,
    ticketType: t.ticketType,
    amountPaise: t.amountPaise,
    holdExpiresAt: t.holdExpiresAt,
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
