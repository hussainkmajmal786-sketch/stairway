import type { EventView } from "@/lib/events/types";
import type { TicketDetail } from "@/lib/registration/tickets";
import type { RegistrationStatus } from "@/lib/registration/types";
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
export type CancelBlock = "checked_in" | "pending_payment" | "paid" | "started";

export const CANCEL_BLOCK_COPY: Record<CancelBlock, string> = {
  checked_in: "You've already checked in, so this registration can't be cancelled.",
  pending_payment: "This registration is waiting for payment. Contact the organisers to change it.",
  paid: "Paid registrations are cancelled by the organisers. Contact us about a refund.",
  started: "This session has already started, so the registration can't be cancelled any more.",
};

export function cancelBlock(
  t: Pick<TicketDetail, "status" | "checkedInAt"> & { event: Pick<TicketDetail["event"], "start" | "pricePaise"> },
  now: number,
): CancelBlock | null {
  if (t.checkedInAt) return "checked_in";
  if (t.status !== "confirmed" && t.status !== "waitlisted") return "pending_payment";
  // The RPC checks the amount paid; in Phase 3 only free events take registrations, so price > 0 means paid.
  if (t.event.pricePaise > 0) return "paid";
  if (!(Date.parse(t.event.start) > now)) return "started";
  return null;
}

/** Download name built only from the slug's safe characters (never the ticket code or user input). */
export function ticketFilename(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `stairway-${safe || "session"}-ticket.png`;
}

/** Page title / h1 for the ticket's state. */
export function ticketHeading(status: RegistrationStatus): string {
  return status === "confirmed" ? "Your ticket" : status === "waitlisted" ? "Your waitlist place" : "Your registration";
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
}

export interface TicketView {
  heading: string;
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
  return {
    heading: ticketHeading(ticket.status),
    card: {
      eyebrow, title: e.title, when, venue, name, status: ticket.status, waitlistPosition: ticket.waitlistPosition,
      pass, token, qrRows: rows, code, checkedInAt: ticket.checkedInAt,
    },
    png: pass.kind === "none" ? null : { eyebrow, title: e.title, when, venue, name, token, qrRows: rows, code },
    cancelBlocked: block ? CANCEL_BLOCK_COPY[block] : null,
    upcoming: !(Date.parse(e.end) < now),
  };
}
