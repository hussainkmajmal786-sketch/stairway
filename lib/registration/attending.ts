import { HANDLE_RE } from "@/lib/profile/handle";
import { safeAvatarUrl } from "@/lib/profile/view";
import type { Attendee } from "./types";

/** How many attendees the event page lists (and the most the attendee query ever returns). */
export const ATTENDEES_SHOWN = 24;

/** A row of public.event_attendees as PostgREST returns it (every column nullable). */
export interface AttendeeRow {
  handle: string | null;
  full_name: string | null;
  avatar_url: string | null;
  headline: string | null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** `/u/<handle>` for a valid handle only; anything else gets no link at all. */
export function profileHref(handle: unknown): string | null {
  return typeof handle === "string" && HANDLE_RE.test(handle) ? `/u/${encodeURIComponent(handle)}` : null;
}

/**
 * View row → Attendee, copying only the four public fields (never spreading the row).
 * Rows whose handle can't be linked are dropped; avatars must come from the allow-listed hosts.
 */
export function rowToAttendee(row: AttendeeRow, supabaseUrl?: string): Attendee | null {
  if (!profileHref(row.handle)) return null;
  return {
    handle: row.handle as string,
    fullName: text(row.full_name),
    avatarUrl: safeAvatarUrl(row.avatar_url, supabaseUrl),
    headline: text(row.headline),
  };
}

export interface AttendingView {
  /** Headline count: confirmed seats, never fewer than the names we can show. */
  total: number;
  shown: Attendee[];
  /** People counted but not listed (beyond the cap, or without a public profile). */
  more: number;
}

/** Caps the list and reconciles it with the public seat count so "N attending" and "+N more" always add up. */
export function attendingView(count: number, attendees: readonly Attendee[] | null, cap: number = ATTENDEES_SHOWN): AttendingView {
  const shown = (attendees ?? []).slice(0, Math.max(0, cap));
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const total = Math.max(safeCount, attendees?.length ?? 0);
  return { total, shown, more: attendees ? total - shown.length : 0 };
}
