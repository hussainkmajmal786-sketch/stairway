"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { formatToken } from "@/lib/tickets/token";
import { authorize } from "./auth";
import { parseRegistrantsPage } from "./registrants";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "./result";

const Id = z.uuid();

export type CheckInOutcome =
  | "checked_in" | "already_checked_in" | "confirm_identity" | "not_found" | "not_confirmed"
  | "event_not_open" | "outside_window" | "invalid_code";

export interface CheckInResult {
  result: CheckInOutcome;
  attendee?: {
    registration_id: string;
    full_name: string;
    handle: string;
    avatar_url: string | null;
    college: string;
    token_number: number | null;
    token_prefix: string;
  };
  checked_in_at?: string;
  status?: string;
}

const OUTCOMES = [
  "checked_in", "already_checked_in", "confirm_identity", "not_found", "not_confirmed",
  "event_not_open", "outside_window", "invalid_code",
] as const;
const CheckInRpcSchema = z.object({
  result: z.enum(OUTCOMES),
  checked_in_at: z.string().optional(),
  status: z.string().optional(),
  attendee: z
    .object({
      registration_id: z.string(),
      full_name: z.string().nullish(),
      handle: z.string().nullish(),
      avatar_url: z.string().nullish(),
      college: z.string().nullish(),
      token_number: z.number().nullish(),
      token_prefix: z.string().nullish(),
    })
    .optional(),
});

/** The event of a registration, read through the session client (RLS hides foreign rows), then authorised. */
async function authorizeRegistration(registrationId: string) {
  const first = await authorize({ kind: "any" });
  if (!first.ok) return first;
  const { data } = await first.db.from("registrations").select("event_id").eq("id", registrationId).maybeSingle();
  if (!data) return { ok: false as const, error: fail("forbidden").error };
  const auth = await authorize({ kind: "event", eventId: data.event_id }, first.db);
  if (!auth.ok) return auth;
  return { ...auth, eventId: data.event_id };
}

async function revalidateRegistrationPaths(
  db: SupabaseClient<Database>,
  eventId: string,
  publicToo: boolean,
) {
  revalidatePath(`/admin/events/${eventId}/registrations`);
  revalidatePath("/admin");
  if (!publicToo) return;
  const { data } = await db.from("events").select("slug").eq("id", eventId).maybeSingle();
  if (data?.slug) revalidatePath(`/events/${data.slug}`);
  revalidatePath("/me/tickets");
}

export async function cancelRegistrationAction(input: unknown): Promise<ActionResult<{ status: string; promoted: number }>> {
  const parsed = z.strictObject({ registrationId: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const auth = await authorizeRegistration(parsed.data.registrationId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.db.rpc("admin_cancel_registration", { p_registration_id: parsed.data.registrationId });
  if (error) return { ok: false, error: mapDbError(error) };
  const out = z.object({ status: z.string(), promoted: z.number().optional() }).safeParse(data);
  await revalidateRegistrationPaths(auth.db, auth.eventId, true);
  return okResult({ status: out.success ? out.data.status : "cancelled", promoted: out.success ? (out.data.promoted ?? 0) : 0 });
}

export async function undoCheckInAction(input: unknown): Promise<ActionResult> {
  const parsed = z.strictObject({ registrationId: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const auth = await authorizeRegistration(parsed.data.registrationId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await auth.db.rpc("admin_undo_check_in", { p_registration_id: parsed.data.registrationId });
  if (error) return { ok: false, error: mapDbError(error) };
  await revalidateRegistrationPaths(auth.db, auth.eventId, false);
  return okResult(undefined);
}

export async function promoteWaitlistAction(input: unknown): Promise<ActionResult<{ promoted: number }>> {
  const parsed = z.strictObject({ eventId: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const auth = await authorize({ kind: "event", eventId: parsed.data.eventId });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.db.rpc("admin_promote_waitlist", { p_event_id: parsed.data.eventId });
  if (error) return { ok: false, error: mapDbError(error) };
  const out = z.object({ promoted: z.number() }).safeParse(data);
  await revalidateRegistrationPaths(auth.db, parsed.data.eventId, true);
  return okResult({ promoted: out.success ? out.data.promoted : 0 });
}

const CheckInInput = z.strictObject({
  eventId: Id,
  code: z.string().trim().min(1).max(40).optional(),
  registrationId: Id.optional(),
  confirm: z.boolean().optional(),
});

/** Hot path: never revalidates. A network or RPC failure is an error, never a local "checked in". */
export async function checkInAction(input: unknown): Promise<ActionResult<CheckInResult>> {
  const parsed = CheckInInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const { eventId, code, registrationId, confirm } = parsed.data;
  if (code === undefined && registrationId === undefined) return fail("invalid_input", "Enter a ticket code or token.");
  const auth = await authorize({ kind: "event", eventId });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.db.rpc("admin_check_in", {
    p_event_id: eventId,
    ...(code !== undefined ? { p_code: code } : {}),
    ...(registrationId !== undefined ? { p_registration_id: registrationId } : {}),
    ...(confirm !== undefined ? { p_confirm: confirm } : {}),
  });
  if (error) return { ok: false, error: mapDbError(error) };
  const out = CheckInRpcSchema.safeParse(data);
  if (!out.success) return fail("unknown");
  const a = out.data.attendee;
  return okResult({
    result: out.data.result,
    ...(out.data.checked_in_at ? { checked_in_at: out.data.checked_in_at } : {}),
    ...(out.data.status ? { status: out.data.status } : {}),
    ...(a
      ? {
          attendee: {
            registration_id: a.registration_id,
            full_name: a.full_name ?? "",
            handle: a.handle ?? "",
            avatar_url: a.avatar_url ?? null,
            college: a.college ?? "",
            token_number: a.token_number ?? null,
            token_prefix: a.token_prefix ?? "",
          },
        }
      : {}),
  });
}

export interface AttendeeHit {
  id: string;
  fullName: string;
  college: string;
  token: string | null;
  status: string;
  checkedIn: boolean;
}

/** Name / token search for the door: at most 10 confirmed attendees, and no contact fields ever. */
export async function searchRegistrantsAction(input: unknown): Promise<ActionResult<AttendeeHit[]>> {
  const parsed = z.strictObject({ eventId: Id, q: z.string().trim().min(1).max(80) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const auth = await authorize({ kind: "event", eventId: parsed.data.eventId });
  if (!auth.ok) return { ok: false, error: auth.error };
  const [{ data, error }, { data: ev }] = await Promise.all([
    auth.db.rpc("admin_event_registrants", {
      p_event_id: parsed.data.eventId, p_status: "confirmed", p_q: parsed.data.q, p_limit: 10, p_offset: 0,
    }),
    auth.db.from("events").select("token_prefix").eq("id", parsed.data.eventId).maybeSingle(),
  ]);
  if (error) return { ok: false, error: mapDbError(error) };
  const page = parseRegistrantsPage(data);
  if (!page) return fail("unknown");
  const prefix = ev?.token_prefix ?? "";
  return okResult(
    page.rows.slice(0, 10).map((r) => ({
      id: r.registration_id,
      fullName: r.full_name ?? "",
      college: r.college ?? "",
      token: typeof r.token_number === "number" ? formatToken(prefix, r.token_number) : null,
      status: r.status,
      checkedIn: Boolean(r.checked_in_at),
    })),
  );
}
