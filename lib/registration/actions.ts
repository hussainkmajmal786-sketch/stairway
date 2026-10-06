"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthState } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CANCELLED_PATH, registrationWindow } from "./cta";
import { errorFromDb, JWT_ERROR_CODES, registrationError, type RegistrationError, type RegistrationErrorCode } from "./errors";
import { parseQuestions, type Question } from "./questions";
import { registrationFieldErrors, registrationSchema } from "./schema";

// Server actions are public POST endpoints (Next checks Origin against Host, nothing more): every action
// re-authenticates, validates its input with zod, derives identity from the session (never from the client),
// runs as the signed-in user (RLS + the RPCs; no service role) and returns UI-shaped data only, never DB error text.

export type RegisterResult =
  | { ok: true; registrationId: string; status: "confirmed" | "waitlisted" }
  | { ok: false; error: RegistrationError; fieldErrors?: Record<string, string> };

/** Only failures come back: a successful cancel redirects to this fixed path (never a client-supplied URL). */
export type CancelResult = { ok: false; error: RegistrationError };

/** Same rule as the events.slug CHECK. */
const SlugSchema = z.string().regex(/^[a-z0-9-]{2,80}$/);
const IdSchema = z.guid();
const RegisterRpcResult = z.object({
  registration_id: z.guid(),
  status: z.enum(["confirmed", "waitlisted"]),
  waitlist_position: z.number().int().nullable(),
});
const CancelRpcResult = z.object({ promoted: z.number().int().nonnegative() });
/** Profile write errors worth showing as-is; everything else (incl. 42501 from a grant/RLS bug) is a save failure. */
const PASS_THROUGH: ReadonlySet<RegistrationErrorCode> = new Set(["busy", "network"]);

type Failure = { ok: false; error: RegistrationError; fieldErrors?: Record<string, string> };

function fail(code: RegistrationErrorCode, fieldErrors?: Record<string, string>): Failure {
  return { ok: false, error: registrationError(code), ...(fieldErrors ? { fieldErrors } : {}) };
}

/** A thrown error (fetch failure, cookies, ...) becomes a typed error; its text never reaches the client. */
function fromThrown(e: unknown): RegistrationError {
  return errorFromDb({ message: e instanceof Error ? e.message : "" }).code === "network"
    ? registrationError("network")
    : registrationError("unknown");
}

function revalidateEvent(slug: string | null) {
  if (slug) {
    revalidatePath(`/events/${slug}`);
    revalidatePath(`/events/${slug}/register`);
  }
  revalidatePath("/me", "layout");
}

/**
 * Saves the edited profile fields back to the profile, then registers through the RPC (which re-checks
 * publication, price, window, answers, capacity and one-per-user under the event row lock).
 */
export async function registerForEvent(slug: string, values: unknown): Promise<RegisterResult> {
  try {
    const slugOk = SlugSchema.safeParse(slug);
    if (!slugOk.success) return fail("event_not_found");
    const { user, profile } = await getAuthState();
    if (!user) return fail("not_signed_in");
    if (!profile?.onboarded) return fail("not_onboarded");

    const db = await createClient();
    const { data: ev, error: evError } = await db
      .from("events")
      .select("id, questions, price_paise, starts_at, registration_opens_at, registration_closes_at")
      .eq("slug", slugOk.data)
      .eq("status", "published")
      .maybeSingle();
    if (evError) return { ok: false, error: errorFromDb(evError) };
    if (!ev) return fail("event_not_found");

    // Cheap pre-checks so a doomed request writes nothing; the RPC stays the authority.
    if (ev.price_paise > 0) return fail("paid_event");
    const win = registrationWindow(
      { start: ev.starts_at, registrationOpensAt: ev.registration_opens_at, registrationClosesAt: ev.registration_closes_at },
      Date.now(),
    );
    if (win === "not_open") return fail("not_open_yet");
    if (win === "closed") return fail("registration_closed");

    let questions: Question[];
    try {
      questions = parseQuestions(ev.questions);
    } catch {
      // Stored questions no longer match the schema: nothing the user can fix.
      return fail("unknown");
    }

    const parsed = registrationSchema(questions).safeParse(values);
    if (!parsed.success) return fail("invalid_input", registrationFieldErrors(parsed.error));
    const { registrant: r, answers } = parsed.data;

    // Column grants allow exactly these columns. RLS turns a blocked write into "0 rows updated" without an
    // error, so an empty result is a failure too.
    const [pub, priv] = await Promise.all([
      db
        .from("profiles")
        .update({ full_name: r.fullName, college: r.college, branch: r.branch, year: r.year })
        .eq("id", user.id)
        .select("id"),
      db
        .from("profile_private")
        .update({ phone: r.phone, ieee_member_id: r.ieeeMemberId })
        .eq("user_id", user.id)
        .select("user_id"),
    ]);
    if (pub.error || !pub.data?.length || priv.error || !priv.data?.length) {
      // Keep the more useful busy / network messages, and "session ended" only for a real JWT error: the session
      // was verified a moment ago, so a 42501 here is a grant/RLS problem, and "sign in again" would loop.
      const writeErr = pub.error ?? priv.error;
      if (writeErr && JWT_ERROR_CODES.has(writeErr.code ?? "")) return fail("not_signed_in");
      const mapped = writeErr ? errorFromDb(writeErr) : null;
      return mapped && PASS_THROUGH.has(mapped.code) ? { ok: false, error: mapped } : fail("profile_save_failed");
    }

    const { data, error } = await db.rpc("register_for_event", { p_event_id: ev.id, p_answers: answers });
    if (error) return { ok: false, error: errorFromDb(error) };
    const res = RegisterRpcResult.safeParse(data);
    // The RPC committed but returned an unexpected shape: the user may well be registered.
    revalidateEvent(slugOk.data);
    if (!res.success) return fail("unknown");
    return { ok: true, registrationId: res.data.registration_id, status: res.data.status };
  } catch (e) {
    return { ok: false, error: fromThrown(e) };
  }
}

/**
 * Cancels the user's own free registration (the RPC checks ownership and promotes the waitlist head), then redirects
 * to My tickets. The redirect matters: revalidating would otherwise re-render the current ticket route, which now 404s.
 */
export async function cancelRegistration(registrationId: string): Promise<CancelResult> {
  const res = await cancelOwnRegistration(registrationId);
  // Outside every try/catch: redirect() throws a control-flow error that must reach Next.
  if (res.ok) redirect(CANCELLED_PATH);
  return res;
}

async function cancelOwnRegistration(
  registrationId: string,
): Promise<{ ok: true; promoted: number } | CancelResult> {
  try {
    const idOk = IdSchema.safeParse(registrationId);
    if (!idOk.success) return fail("registration_not_found");
    const { user } = await getAuthState();
    if (!user) return fail("not_signed_in");

    const db = await createClient();
    // Only to know which event page to revalidate (RLS: own rows only). Ownership is enforced by the RPC.
    const { data: own } = await db
      .from("registrations")
      .select("event:events(slug)")
      .eq("id", idOk.data)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data, error } = await db.rpc("cancel_registration", { p_registration_id: idOk.data });
    if (error) return { ok: false, error: errorFromDb(error) };
    const res = CancelRpcResult.safeParse(data);

    const ev = own?.event as { slug?: unknown } | null | undefined;
    const slug = typeof ev?.slug === "string" && SlugSchema.safeParse(ev.slug).success ? ev.slug : null;
    // Only what shows this registration: the event's seat count / CTA and the /me pages (not the ticket itself).
    if (slug) {
      revalidatePath(`/events/${slug}`);
      revalidatePath(`/events/${slug}/register`);
    }
    revalidatePath("/me");
    revalidatePath("/me/tickets");
    // The cancellation committed; only the promotion count is unknown if the shape is unexpected.
    return { ok: true, promoted: res.success ? res.data.promoted : 0 };
  } catch (e) {
    return { ok: false, error: fromThrown(e) };
  }
}
