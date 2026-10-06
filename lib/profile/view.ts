import { HANDLE_RE } from "./handle";
import { linksFromDb } from "./editor";
import { SOCIAL_KEYS, type SocialKey } from "./options";

/** True only for absolute http(s) URLs: the only scheme we ever put in an href from user data. */
export function isHttpUrl(v: unknown): v is string {
  if (typeof v !== "string" || !/^https?:\/\//i.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * `profiles.links` has no DB constraint, so anything could be stored there.
 * Returns the known social links in display order, keeping only http(s) URLs.
 */
export function safeLinks(raw: unknown): { key: SocialKey; url: string }[] {
  const links = linksFromDb(raw);
  return SOCIAL_KEYS.filter((k) => isHttpUrl(links[k])).map((k) => ({ key: k, url: links[k] }));
}

/** Route param → canonical handle (decoded, trimmed, lowercased), or null if it can't be a valid handle. */
export function parseHandleParam(raw: string): string | null {
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    return null;
  }
  s = s.trim().toLowerCase();
  return HANDLE_RE.test(s) ? s : null;
}

/** "2025-05-01" → "May 2025" (date-only values, formatted in UTC so the server timezone can't shift the month). */
export function formatMonth(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}
