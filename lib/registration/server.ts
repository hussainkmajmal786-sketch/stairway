import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeAvatarUrl } from "@/lib/profile/view";
import { ACTIVE_STATUSES, type Attendee, type MyRegistration } from "./types";
import { rowToTicket, TICKET_SELECT, toSummary, type TicketDetail, type TicketRow, type TicketSummary } from "./tickets";

// Ids are checked as 8-4-4-4-12 hex (z.guid: Postgres accepts any version) so junk never reaches a query.
// Reads run as the signed-in user (RLS: registrations are own rows only; event_attendees is signed-in only).

const isUuid = (v: unknown): v is string => z.guid().safeParse(v).success;

/** The user's active registration for an event, or null (none, or it could not be read). */
export async function getMyRegistration(eventId: string, userId: string): Promise<MyRegistration | null> {
  if (!isUuid(eventId) || !isUuid(userId)) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("registrations")
    .select("id, status, waitlist_position")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES])
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, status: data.status, waitlistPosition: data.waitlist_position };
}

/** Confirmed attendees (public profile fields only), by name. Null when the list could not be loaded. */
export async function getAttendees(eventId: string): Promise<Attendee[] | null> {
  if (!isUuid(eventId)) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("event_attendees")
    .select("handle, full_name, avatar_url, headline")
    .eq("event_id", eventId)
    .order("full_name");
  if (error || !data) return null;
  return data
    .filter((a): a is typeof a & { handle: string } => typeof a.handle === "string" && a.handle.length > 0)
    .map((a) => ({
      handle: a.handle,
      fullName: a.full_name ?? "",
      avatarUrl: safeAvatarUrl(a.avatar_url),
      headline: a.headline ?? "",
    }));
}

/** All active tickets of the user, without ticket codes, soonest first. Throws if they could not be loaded. */
export async function getMyTickets(userId: string): Promise<TicketSummary[]> {
  if (!isUuid(userId)) return [];
  const db = await createClient();
  const { data, error } = await db
    .from("registrations")
    .select(TICKET_SELECT)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES]);
  // Server-side only (error boundaries never show this text to the browser in production).
  if (error || !data) throw new Error(`Failed to load tickets: ${error?.message ?? "no data"}`);
  return (data as unknown as TicketRow[])
    .map(rowToTicket)
    .filter((t): t is TicketDetail => t !== null)
    .map(toSummary)
    .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));
}

/** One active ticket of the user (with its code), or null (not theirs, not active, malformed id, or unreadable). */
export async function getTicket(id: string, userId: string): Promise<TicketDetail | null> {
  if (!isUuid(id) || !isUuid(userId)) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("registrations")
    .select(TICKET_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES])
    .maybeSingle();
  if (error || !data) return null;
  return rowToTicket(data as unknown as TicketRow);
}
