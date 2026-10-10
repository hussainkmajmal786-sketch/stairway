import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ATTENDEES_SHOWN, rowToAttendee } from "./attending";
import { ACTIVE_STATUSES, type Attendee, type MyRegistration } from "./types";
import { rowToSummary, rowToTicket, TICKET_LIST_SELECT, TICKET_SELECT, type TicketDetail, type TicketListRow, type TicketRow, type TicketSummary } from "./tickets";

// Ids are checked as 8-4-4-4-12 hex (z.guid: Postgres accepts any version) so junk never reaches a query.
// Reads run as the signed-in user (RLS: registrations are own rows only; event_attendees is signed-in only).

const isUuid = (v: unknown): v is string => z.guid().safeParse(v).success;

/** The user's active (or refund-pending) registration for an event, or null (none, or it could not be read). */
export async function getMyRegistration(eventId: string, userId: string): Promise<MyRegistration | null> {
  if (!isUuid(eventId) || !isUuid(userId)) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("registrations")
    .select("id, status, waitlist_position, hold_expires_at")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES, "refund_needed"])
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, status: data.status, waitlistPosition: data.waitlist_position, holdExpiresAt: data.hold_expires_at };
}

/**
 * Confirmed attendees (public profile fields only), by name then handle (unique, so the order is stable),
 * at most `limit` rows so a big event stays light. Null when the list could not be loaded.
 */
export async function getAttendees(eventId: string, limit: number = ATTENDEES_SHOWN): Promise<Attendee[] | null> {
  if (!isUuid(eventId)) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("event_attendees")
    .select("handle, full_name, avatar_url, headline")
    .eq("event_id", eventId)
    .order("full_name")
    .order("handle")
    .limit(Math.max(1, Math.min(limit, ATTENDEES_SHOWN)));
  if (error || !data) return null;
  return data.map((r) => rowToAttendee(r)).filter((a): a is Attendee => a !== null);
}

/** All active tickets of the user, without ticket codes, soonest first. Throws if they could not be loaded. */
export async function getMyTickets(userId: string): Promise<TicketSummary[]> {
  if (!isUuid(userId)) return [];
  const db = await createClient();
  const { data, error } = await db
    .from("registrations")
    .select(TICKET_LIST_SELECT)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES]);
  // Server-side only (error boundaries never show this text to the browser in production).
  if (error || !data) throw new Error(`Failed to load tickets: ${error?.message ?? "no data"}`);
  return (data as unknown as TicketListRow[])
    .map(rowToSummary)
    .filter((t): t is TicketSummary => t !== null)
    .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));
}

/** One active ticket of the user (with its code), or null when there is no such ticket (not theirs, not active, malformed id). Throws if the read fails. */
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
  // A failed read must reach app/me/tickets/error.tsx (retry), not look like a missing ticket (404).
  if (error) throw new Error(`Failed to load ticket: ${error.message}`);
  if (!data) return null;
  return rowToTicket(data as unknown as TicketRow);
}
