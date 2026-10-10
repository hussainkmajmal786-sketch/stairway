import { ticketPath } from "@/lib/registration/cta";
import { splitTickets, type TicketSummary } from "@/lib/registration/tickets";
import type { RegistrationStatus } from "@/lib/registration/types";
import { longDate, pad2, shortDate, timeOf } from "@/lib/weekends";

export type StatusTone = "green" | "yellow" | "orange" | "outline";

/** Status tag text and colour (colour never stands alone: the label always says it). */
export function statusLabel(status: RegistrationStatus, waitlistPosition: number | null): { label: string; tone: StatusTone } {
  switch (status) {
    case "confirmed":
      return { label: "Confirmed", tone: "green" };
    case "waitlisted":
      return { label: waitlistPosition != null ? `Waitlist #${waitlistPosition}` : "Waitlisted", tone: "yellow" };
    case "pending_payment":
      return { label: "Payment pending", tone: "orange" };
    case "cancelled":
      return { label: "Cancelled", tone: "outline" };
    case "refund_needed":
      return { label: "Refund pending", tone: "orange" };
    case "refunded":
      return { label: "Refunded", tone: "outline" };
  }
}

/**
 * What kind of door pass this ticket uses. The door token itself is only named for a confirmed seat (a waitlisted
 * row may still carry an old number in the DB); lists never carry the QR ticket code at all.
 */
export function passLabel(t: Pick<TicketSummary, "status" | "ticketType" | "token">): string {
  if (t.status === "refund_needed" || t.status === "refunded" || t.status === "cancelled") return "No entry pass";
  if (t.status !== "confirmed") return t.ticketType === "token" ? "Token pass once confirmed" : "QR pass once confirmed";
  if (t.ticketType === "token" && t.token) return `Token ${t.token}`;
  return "QR pass";
}

export interface TicketListRow {
  id: string;
  href: string;
  eyebrow: string;
  title: string;
  /** Date and time in IST, e.g. "Sat, 10 Oct, 9:30 am IST". */
  when: string;
  status: { label: string; tone: StatusTone };
  pass: string;
  /** End of a live payment hold (shown as a countdown), else null. */
  holdExpiresAt: string | null;
}

/** Everything one row of My tickets renders, derived from a summary (which never holds the ticket code). */
export function ticketListRow(t: TicketSummary, now: number = Date.now()): TicketListRow {
  const e = t.event;
  const hold = t.status === "pending_payment" && t.holdExpiresAt && Date.parse(t.holdExpiresAt) > now ? t.holdExpiresAt : null;
  return {
    id: t.id,
    href: ticketPath(t.id),
    eyebrow: `${e.societyShort} · Step ${pad2(e.step)}`,
    title: e.title,
    when: `${shortDate(e.start)}, ${timeOf(e.start)} IST`,
    status: statusLabel(t.status, t.waitlistPosition),
    pass: passLabel(t),
    holdExpiresAt: hold,
  };
}

/** My tickets: upcoming (soonest first) and past (most recent first) rows. */
export function ticketGroups(list: readonly TicketSummary[], now: number): { upcoming: TicketListRow[]; past: TicketListRow[] } {
  const { upcoming, past } = splitTickets(list, now);
  return { upcoming: upcoming.map((t) => ticketListRow(t, now)), past: past.map((t) => ticketListRow(t, now)) };
}

export interface NextStep {
  href: string;
  eyebrow: string;
  title: string;
  /** Long date and time in IST. */
  when: string;
  start: string;
  /** Already started (but not ended): show "happening now" instead of a zeroed countdown. */
  live: boolean;
  waitlisted: boolean;
  waitlistPosition: number | null;
}

/**
 * The Overview's "Your next step": the soonest not-yet-ended confirmed seat; failing that, the soonest waitlist place
 * (so a waitlisted user still sees where they stand). Pending-payment rows are never the next step. Null when none.
 */
export function nextStep(list: readonly TicketSummary[], now: number): NextStep | null {
  const { upcoming } = splitTickets(list, now);
  const t = upcoming.find((x) => x.status === "confirmed") ?? upcoming.find((x) => x.status === "waitlisted");
  if (!t) return null;
  const e = t.event;
  return {
    href: ticketPath(t.id),
    eyebrow: `${e.societyShort} · Step ${pad2(e.step)}`,
    title: e.title,
    when: `${longDate(e.start)} · ${timeOf(e.start)} IST`,
    start: e.start,
    live: !(Date.parse(e.start) > now),
    waitlisted: t.status === "waitlisted",
    waitlistPosition: t.waitlistPosition,
  };
}
