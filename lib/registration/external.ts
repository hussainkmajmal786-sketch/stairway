import type { Settings } from "@/lib/site/schema";

const PLACEHOLDER = /your-form-id/i;

/** An https URL without credentials, never the seed placeholder; otherwise null. */
export function safeFormUrl(raw: string): string | null {
  const s = raw.trim();
  if (!/^https:\/\//i.test(s) || PLACEHOLDER.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** `registration.mode: "external"` sends every Register button to the Google Form (if it is a real https link). */
export function externalRegistrationUrl(reg: Settings["registration"]): string | null {
  return reg.mode === "external" ? safeFormUrl(reg.googleFormUrl) : null;
}

/** Google Form shown as a recovery option when on-site registration fails. */
export function fallbackFormUrl(reg: Settings["registration"]): string | null {
  return safeFormUrl(reg.googleFormUrl);
}
