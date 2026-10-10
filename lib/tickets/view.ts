import type { EventView } from "@/lib/events/types";
import type { TicketDetail } from "@/lib/registration/tickets";
import type { RegistrationStatus } from "@/lib/registration/types";
import { formatInr } from "@/lib/payments/money";
import type { Settings } from "@/lib/site/schema";
import { longDate, pad2, timeOf } from "@/lib/weekends";
import type { TicketPngData } from "./png";
import { qrRows } from "./qr";

export { QUIET_ZONE } from "./layout";

/** What the ticket page shows as the door pass. Only confirmed seats get one (waitlisted/pending rows carry a code too). */
export type DoorPass = { kind: "qr" } | { kind: "token"; token: string } | { kind: "none" };

export function doorPass(t: Pick<TicketDetail, "status" | "ticketType" | "token">): DoorPass {
  if (t.status !== "confirmed") return { kind: "none" };
  // A token event whose seat somehow has no token number still gets a scannable pass.
  if (t.ticketType === "token" && t.token) return { kind: "token", token: t.token };
  return { kind: "qr" };
}

/** Why the registration can't be cancelled here, mirroring cancel_registration's refusals; null when it can. */
export type CancelBlock = "checked_in" | "inactive" | "started";

export const CANCEL_BLOCK_COPY: Record<CancelBlock, string> = {
  checked_in: "You've already checked in, so this registration can't be cancelled.",
  inactive: "This registration is no longer active.",
  started: "This session has already started, so the registration can't be cancelled any more.",
};

export function cancelBlock(
  t: Pick<TicketDetail, "status" | "checkedInAt"> & { event: Pick<TicketDetail["event"], "start"> },
  now: number,
): CancelBlock | null {
  if (t.checkedInAt) return "checked_in";
  if (t.status !== "confirmed" && t.status !== "waitlisted" && t.status !== "pending_payment") return "inactive";
  // A payment hold can always be released; seats and waitlist places only before the start.
  if (t.status !== "pending_payment" && !(Date.parse(t.event.start) > now)) return "started";
  return null;
}

/** Download name built only from the slug's safe characters (never the ticket code or user input). */
export function ticketFilename(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `stairway-${safe || "session"}-ticket.png`;
}

const HEADINGS: Record<RegistrationStatus, string> = {
  confirmed: "Your ticket",
  waitlisted: "Your waitlist place",
  pending_payment: "Complete your payment",
  refund_needed: "Refund pending",
  refunded: "Refunded",
  cancelled: "Registration cancelled",
};

/** Page title / h1 for the ticket's state. */
export function ticketHeading(status: RegistrationStatus): string {
  return HEADINGS[status];
}

/** What the ticket explains instead of a door pass (every status but confirmed). */
export type TicketNotice =
  | { kind: "none" }
  | { kind: "waitlisted"; position: number | null; paid: boolean }
  | { kind: "pay"; holdExpiresAt: string; amountPaise: number }
  | { kind: "processing" }
  | { kind: "hold_expired" }
  | { kind: "refund_needed"; amount: string; latePayment: boolean }
  | { kind: "refunded"; amount: string; refundedOn: string | null }
  | { kind: "cancelled" };

/** `justPaid` = Checkout just reported success (?paid=1): show "confirming" until the server's status changes. */
export function ticketNotice(
  t: Pick<TicketDetail, "status" | "waitlistPosition" | "holdExpiresAt" | "amountPaise" | "cancelReason" | "refundedAt"> & {
    event: Pick<TicketDetail["event"], "pricePaise">;
  },
  now: number,
  justPaid = false,
): TicketNotice {
  switch (t.status) {
    case "confirmed":
      return { kind: "none" };
    case "waitlisted":
      return { kind: "waitlisted", position: t.waitlistPosition, paid: t.event.pricePaise > 0 };
    case "pending_payment": {
      if (justPaid) return { kind: "processing" };
      const end = t.holdExpiresAt;
      return end && Date.parse(end) > now ? { kind: "pay", holdExpiresAt: end, amountPaise: t.amountPaise } : { kind: "hold_expired" };
    }
    case "refund_needed":
      return { kind: "refund_needed", amount: formatInr(t.amountPaise), latePayment: t.cancelReason === "late_payment_no_seat" };
    case "refunded":
      return { kind: "refunded", amount: formatInr(t.amountPaise), refundedOn: t.refundedAt ? longDate(t.refundedAt) : null };
    case "cancelled":
      return t.cancelReason === "hold_expired" ? { kind: "hold_expired" } : { kind: "cancelled" };
  }
}

export interface TicketCardData {
  eyebrow: string;
  title: string;
  when: string;
  venue: string;
  name: string;
  status: RegistrationStatus;
  waitlistPosition: number | null;
  pass: DoorPass;
  /** Door token of a confirmed seat (shown next to the QR when the event also numbers seats). */
  token: string | null;
  /** QR matrix (confirmed QR tickets only) and the human-readable code printed beneath it. */
  qrRows: string[] | null;
  code: string | null;
  checkedInAt: string | null;
  /** What to say instead of a door pass (kind "none" for a confirmed seat). */
  notice: TicketNotice;
  /** Receipt of an accepted payment, e.g. { number: "STW-2026-000012", amount: "₹199" }. */
  receipt: { number: string; amount: string } | null;
}

export interface TicketView {
  heading: string;
  notice: TicketNotice;
  card: TicketCardData;
  /** Null unless there is a door pass (confirmed). */
  png: TicketPngData | null;
  /** Reason the cancel is refused (shown instead of the action), or null. */
  cancelBlocked: string | null;
  /** The session hasn't ended yet. */
  upcoming: boolean;
}

/**
 * Everything the ticket page renders, derived in one place. The ticket code (a bearer secret for the door) and the
 * door token leave this function only for a confirmed seat; every other status gets nulls.
 */
export function ticketView(
  ticket: TicketDetail,
  name: string,
  settings: Pick<Settings, "venue">,
  ev: Pick<EventView, "venue"> | null,
  now: number,
  justPaid = false,
): TicketView {
  const pass = doorPass(ticket);
  const confirmed = ticket.status === "confirmed";
  const rows = pass.kind === "qr" ? qrRows(ticket.ticketCode) : null;
  const code = pass.kind === "qr" ? ticket.ticketCode : null;
  const token = confirmed ? ticket.token : null;
  const e = ticket.event;
  const eyebrow = `${e.societyShort} · Step ${pad2(e.step)}`;
  const when = `${longDate(e.start)} · ${timeOf(e.start)} – ${timeOf(e.end)} IST`;
  const venue = [ev?.venue || settings.venue.hall, settings.venue.name].filter(Boolean).join(", ");
  const block = cancelBlock(ticket, now);
  const notice = ticketNotice(ticket, now, justPaid);
  const receipt = ticket.receiptNumber && ticket.amountPaise > 0
    ? { number: ticket.receiptNumber, amount: formatInr(ticket.amountPaise) }
    : null;
  return {
    heading: ticketHeading(ticket.status),
    notice,
    card: {
      eyebrow, title: e.title, when, venue, name, status: ticket.status, waitlistPosition: ticket.waitlistPosition,
      pass, token, qrRows: rows, code, checkedInAt: ticket.checkedInAt, notice, receipt,
    },
    png: pass.kind === "none" ? null : { eyebrow, title: e.title, when, venue, name, token, qrRows: rows, code },
    cancelBlocked: block ? CANCEL_BLOCK_COPY[block] : null,
    upcoming: !(Date.parse(e.end) < now),
  };
}
