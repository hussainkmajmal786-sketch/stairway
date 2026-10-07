import type { Settings } from "@/lib/site/schema";
import { registerPath } from "@/lib/registration/cta";
import { externalRegistrationUrl } from "@/lib/registration/external";

export const pad2 =(n: number) => String(n).padStart(2, "0");

const TZ = "Asia/Kolkata";

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...opts }).format(new Date(iso));
}

export const shortDate = (iso: string) =>
  formatDate(iso, { weekday: "short", day: "2-digit", month: "short" });
export const longDate = (iso: string) =>
  formatDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const timeOf = (iso: string) =>
  formatDate(iso, { hour: "numeric", minute: "2-digit", hour12: true });

/** Whole days from `now` until `iso` (0 = today / already started). */
export function daysUntil(iso: string, now: number) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
}

/** Where the session list lives on the home page: the fallback when no session is open for registration. */
export const SESSIONS_HREF = "/#societies";

/** The slug of a session that can still be registered for (not completed), else null. */
export const openSlug = (e?: { slug: string; status: string } | null) => (e && e.status !== "completed" ? e.slug : null);

/**
 * Every site-wide Register link. External (Google Form) mode sends all of them to the https-only form;
 * otherwise a session's own /events/<slug>/register page, or the session list when there is no session.
 */
export function registerHref(slug?: string | null, registration?: Settings["registration"]) {
  const external = registration ? externalRegistrationUrl(registration) : null;
  if (external) return external;
  return slug ? registerPath(slug) : SESSIONS_HREF;
}

export function seatsTone(w: { seatsLeft: number; seatsTotal: number }) {
  if (w.seatsLeft === 0) return "full";
  return w.seatsLeft / w.seatsTotal < 0.2 ? "low" : "ok";
}
