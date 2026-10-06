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
  | { kind: "paid_soon" };

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
 * Precedence: an active registration always wins (ticket / waitlist position, even after the event);
 * then closed; then external-form mode; then not-yet-open; then paid (Phase 4); then sign-in / waitlist / register.
 */
export function ctaState(i: CtaInput): CtaState {
  const r = i.registration && isActiveStatus(i.registration.status) ? i.registration : null;
  if (r?.status === "waitlisted") return { kind: "waitlisted", registrationId: r.id, position: r.waitlistPosition ?? 0 };
  if (r) return { kind: "registered", registrationId: r.id };

  const win = registrationWindow(i.event, i.now);
  if (win === "closed") return { kind: "closed" };
  const external = i.externalUrl ? safeFormUrl(i.externalUrl) : null;
  if (external) return { kind: "external", href: external };
  if (win === "not_open") return { kind: "opens", opensAt: i.event.registrationOpensAt ?? i.event.start };
  if (i.event.pricePaise > 0) return { kind: "paid_soon" };

  const href = registerPath(i.event.slug);
  const full = i.event.seatsLeft <= 0;
  if (!i.signedIn) return { kind: "sign_in", href: loginPath(href), full };
  return full ? { kind: "join_waitlist", href } : { kind: "register", href };
}
