import { publicEnv } from "@/lib/env";
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

/** Google account photos (OAuth sign-up seeds avatar_url from the provider). */
const AVATAR_EXTRA_HOSTS = ["lh3.googleusercontent.com"];

/**
 * Avatar URL safe to render for another user's profile: https only, and only from our Supabase storage host
 * or the Google photo host. Anything else returns undefined so the monogram is shown instead.
 */
export function safeAvatarUrl(v: unknown, supabaseUrl: string = publicEnv.supabaseUrl): string | undefined {
  if (typeof v !== "string" || !/^https:\/\//i.test(v)) return undefined;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" || u.username || u.password) return undefined;
  let storageHost = "";
  try {
    storageHost = new URL(supabaseUrl).hostname;
  } catch {
    /* no storage host */
  }
  const host = u.hostname.toLowerCase();
  return (storageHost && host === storageHost.toLowerCase()) || AVATAR_EXTRA_HOSTS.includes(host) ? v : undefined;
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
