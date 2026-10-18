// Invite tokens (pure + WebCrypto; no Node modules so it runs on Workers). The raw token exists only in memory:
// generated, hashed, shown once. The database stores the SHA-256 hex only.

export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
/** The table caps expires_at at created_at + 7 days (database clock): stay a minute inside it. */
const EXPIRY_SKEW_MS = 60_000;
export const MAX_OPEN_INVITES = 50;

export function newInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function inviteUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/invite/${token}`;
}

export function inviteExpiry(nowMs: number): Date {
  return new Date(nowMs + INVITE_TTL_MS - EXPIRY_SKEW_MS);
}

/** Typed-confirmation matcher: exact, case-sensitive, no trimming games; an empty expectation never matches. */
export function confirmMatches(typed: unknown, expected: unknown): boolean {
  return typeof typed === "string" && typeof expected === "string" && expected.length > 0 && typed === expected;
}
