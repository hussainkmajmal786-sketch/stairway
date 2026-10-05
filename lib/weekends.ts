export const pad2 = (n: number) => String(n).padStart(2, "0");

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

export function registerHref(slug?: string) {
  return slug ? `/register?step=${slug}` : "/register";
}

export function seatsTone(w: { seatsLeft: number; seatsTotal: number }) {
  if (w.seatsLeft === 0) return "full";
  return w.seatsLeft / w.seatsTotal < 0.2 ? "low" : "ok";
}
