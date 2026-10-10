import { safeFormUrl } from "./external";
import { isActiveStatus, type MyRegistration } from "./types";

/** Internal paths; dynamic segments are percent-encoded so a stray "/" or "?" can never change the route. */
export const registerPath = (slug: string) => `/events/${encodeURIComponent(slug)}/register`;
export const ticketPath = (id: string) => `/me/tickets/${encodeURIComponent(id)}`;
/** Where a successful cancel lands (My tickets shows the confirmation). Fixed: never built from input. */
export const CANCELLED_PATH = "/me/tickets?cancelled=1";
export const loginPath = (next: string) => `/login?next=${encodeURIComponent(next)}`;

export interface CtaEvent {
  slug: string;
  start: string;
  pricePaise: number;
  seatsLeft: number;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
}

export interface CtaInput {
  now: number;
  event: CtaEvent;
  signedIn: boolean;
  /** The viewer's registration for this event, if any. */
  registration: MyRegistration | null;
  /** Set when site settings say registration happens on an external (Google) form. */
  externalUrl: string | null;
  /** Payments switched on (lib/payments/config.ts). When off, paid events show "Paid registration opens soon". */
  paymentsEnabled?: boolean;
}

export type CtaState =
  | { kind: "register"; href: string }
  | { kind: "join_waitlist"; href: string }
  | { kind: "sign_in"; href: string; full: boolean }
  | { kind: "registered"; registrationId: string }
  | { kind: "waitlisted"; registrationId: string; position: number }
  | { kind: "opens"; opensAt: string }
  | { kind: "closed" }
  | { kind: "external"; href: string }
  | { kind: "paid_soon" }
  | { kind: "pay"; href: string; pricePaise: number }
  | { kind: "complete_payment"; registrationId: string; holdExpiresAt: string }
  | { kind: "refund_pending"; registrationId: string };

export function ctaEvent(e: {
  slug: string;
  start: string;
  pricePaise: number;
  seatsTotal: number;
  seatsFilled: number;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
}): CtaEvent {
  return {
    slug: e.slug,
    start: e.start,
    pricePaise: e.pricePaise,
    seatsLeft: Math.max(0, e.seatsTotal - e.seatsFilled),
    registrationOpensAt: e.registrationOpensAt,
    registrationClosesAt: e.registrationClosesAt,
  };
}

/** Same rules as register_for_event: not before opens_at; closed at the earlier of closes_at and the start. */
export function registrationWindow(
  e: Pick<CtaEvent, "start" | "registrationOpensAt" | "registrationClosesAt">,
  now: number,
): "not_open" | "open" | "closed" {
  if (e.registrationOpensAt && now < Date.parse(e.registrationOpensAt)) return "not_open";
  const start = Date.parse(e.start);
  const closes = e.registrationClosesAt ? Math.min(Date.parse(e.registrationClosesAt), start) : start;
  return now >= closes ? "closed" : "open";
}

/**
 * Precedence: a pending refund; then an active registration (ticket / waitlist / live hold → Complete payment), even
 * after the event; an expired hold counts as no registration (the cron cancels it within minutes); then closed;
 * external-form mode; not-yet-open; paid while payments are off; then sign-in / waitlist / Pay / Register.
 */
export function ctaState(i: CtaInput): CtaState {
  const reg = i.registration;
  if (reg?.status === "refund_needed") return { kind: "refund_pending", registrationId: reg.id };
  // Same rule as the DB: a hold counts while hold_expires_at > now (an unparsable end reads as expired).
  const holdEnd = reg?.status === "pending_payment" && reg.holdExpiresAt ? Date.parse(reg.holdExpiresAt) : null;
  const holdExpired = holdEnd !== null && !(holdEnd > i.now);
  const r = reg && isActiveStatus(reg.status) && !holdExpired ? reg : null;
  if (r?.status === "waitlisted") return { kind: "waitlisted", registrationId: r.id, position: r.waitlistPosition ?? 0 };
  if (r?.status === "pending_payment" && r.holdExpiresAt) {
    return { kind: "complete_payment", registrationId: r.id, holdExpiresAt: r.holdExpiresAt };
  }
  if (r) return { kind: "registered", registrationId: r.id };

  const win = registrationWindow(i.event, i.now);
  if (win === "closed") return { kind: "closed" };
  const external = i.externalUrl ? safeFormUrl(i.externalUrl) : null;
  if (external) return { kind: "external", href: external };
  if (win === "not_open") return { kind: "opens", opensAt: i.event.registrationOpensAt ?? i.event.start };
  const paid = i.event.pricePaise > 0;
  if (paid && !i.paymentsEnabled) return { kind: "paid_soon" };

  const href = registerPath(i.event.slug);
  const full = i.event.seatsLeft <= 0;
  if (!i.signedIn) return { kind: "sign_in", href: loginPath(href), full };
  if (full) return { kind: "join_waitlist", href };
  return paid ? { kind: "pay", href, pricePaise: i.event.pricePaise } : { kind: "register", href };
}
