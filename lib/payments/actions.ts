"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthState } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorFromDb, registrationError, type RegistrationError, type RegistrationErrorCode } from "@/lib/registration/errors";
import { paymentsConfig } from "./config";
import { confirmVerifiedPayment, type ConfirmOutcome } from "./confirm";
import { verifyCheckoutSignature } from "./crypto";
import { createOrder, ORDER_ID, PAYMENT_ID, RazorpayError, type FetchLike } from "./razorpay";

// Server actions are public POST endpoints: each re-checks the flag and the session, validates input with strict zod,
// derives identity from the session only and returns UI-shaped data only (never DB / Razorpay text or a secret; the
// Razorpay key id is public by design). The order amount is the hold's amount_paise (set by register_for_event from
// events.price_paise), never a client value. The service role is used for exactly two calls: attaching the order to
// the session user's own hold (attach_payment_order is service-role only) and confirm_payment after the checkout
// signature verified and the registration was found to be the user's own.
// Only async functions may be exported from a "use server" file (types are erased and fine).

export interface CheckoutData {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: "INR";
  name: "st(AI)rway";
  description: string;
  prefill: { name: string; email: string };
  notes: { source: "stairway"; registration_id: string };
  /** Checkout's `timeout` is derived from this in the browser (seconds left minus a 60 s margin). */
  holdExpiresAt: string;
  registrationId: string;
}
export type CreateOrderResult = { ok: true; checkout: CheckoutData } | { ok: false; error: RegistrationError };
export type VerifyResult =
  | { ok: true; status: "confirmed" | "processing" | "refund_needed" }
  | { ok: false; error: RegistrationError };

/** No order is created or handed out with less than this left on the hold (Checkout itself closes 60 s early). */
const MIN_HOLD_LEFT_MS = 120_000;
const IdSchema = z.guid();
const AttachResult = z.object({ order_id: z.string().regex(ORDER_ID) });
const VerifyInput = z.strictObject({
  registrationId: z.guid(),
  orderId: z.string().regex(ORDER_ID),
  paymentId: z.string().regex(PAYMENT_ID),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});
const NETWORK_RE = /fetch failed|failed to fetch|networkerror|network request failed|load failed/i;
// Resolved at call time so tests (and OpenNext) see the current global fetch.
const httpFetch: FetchLike = (url, init) => fetch(url, init);

type Failure = { ok: false; error: RegistrationError };
function fail(code: RegistrationErrorCode): Failure {
  return { ok: false, error: registrationError(code) };
}

/** A thrown error becomes a typed error; its text never reaches the client. */
function fromThrown(e: unknown): Failure {
  if (e instanceof RazorpayError) return fail(e.code === "NETWORK" || e.code === "TIMEOUT" ? "network" : "checkout_unavailable");
  return fail(e instanceof Error && NETWORK_RE.test(e.message) ? "network" : "unknown");
}

function refresh(slug: string | null) {
  try {
    if (slug) {
      revalidatePath(`/events/${slug}`);
      revalidatePath(`/events/${slug}/register`);
    }
    revalidatePath("/me", "layout");
  } catch {
    // Best effort: every page renders per request anyway.
  }
}

const slugOf = (event: unknown): string | null => {
  const s = (event as { slug?: unknown } | null)?.slug;
  return typeof s === "string" && /^[a-z0-9-]{2,80}$/.test(s) ? s : null;
};

/** Creates (or reuses) the Razorpay order for the user's own live hold and returns what Checkout needs. */
export async function createPaymentOrder(registrationId: string): Promise<CreateOrderResult> {
  try {
    const cfg = paymentsConfig();
    if (!cfg.enabled) return fail("paid_event");
    const id = IdSchema.safeParse(registrationId);
    if (!id.success) return fail("registration_not_found");
    const { user, profile } = await getAuthState();
    if (!user) return fail("not_signed_in");
    if (!profile?.onboarded) return fail("not_onboarded");

    // The session client reads the user's own row (RLS + explicit user filter).
    const db = await createClient();
    const { data: row, error } = await db
      .from("registrations")
      .select("id, event_id, status, amount_paise, hold_expires_at, razorpay_order_id, event:events(title, slug)")
      .eq("id", id.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return { ok: false, error: errorFromDb(error) };
    if (!row) return fail("registration_not_found");
    const holdEnd = row.hold_expires_at ? Date.parse(row.hold_expires_at) : NaN;
    // Too little time left to pay safely: the user starts again with a fresh hold.
    if (row.status !== "pending_payment" || !row.hold_expires_at || !(holdEnd - Date.now() >= MIN_HOLD_LEFT_MS)) {
      return fail("hold_expired");
    }
    if (!Number.isInteger(row.amount_paise) || row.amount_paise < 100) return fail("unknown");

    let orderId = row.razorpay_order_id;
    if (!orderId) {
      const order = await createOrder({ keyId: cfg.keyId, keySecret: cfg.keySecret }, httpFetch, {
        amountPaise: row.amount_paise,
        receipt: `stw-${row.id}`,
        notes: { source: "stairway", registration_id: row.id, event_id: row.event_id },
      });
      if (order.amount !== row.amount_paise || order.currency !== "INR") return fail("unknown");
      // Service role, with the SESSION user's id: the RPC re-checks ownership, the live hold and the amount.
      const admin = createAdminClient(cfg.serviceRoleKey);
      const { data: att, error: attErr } = await admin.rpc("attach_payment_order", {
        p_user_id: user.id,
        p_registration_id: row.id,
        p_order_id: order.id,
        p_amount_paise: row.amount_paise,
      });
      if (attErr) return { ok: false, error: errorFromDb(attErr) };
      const parsed = AttachResult.safeParse(att);
      if (!parsed.success) return fail("unknown");
      // When two tabs raced, the database keeps the first order; everyone pays that one.
      orderId = parsed.data.order_id;
    }

    const title = (row.event as { title?: unknown } | null)?.title;
    return {
      ok: true,
      checkout: {
        keyId: cfg.keyId,
        orderId,
        amountPaise: row.amount_paise,
        currency: "INR",
        name: "st(AI)rway",
        description: typeof title === "string" && title ? title.slice(0, 120) : "Session registration",
        prefill: { name: profile.fullName ?? "", email: user.email },
        notes: { source: "stairway", registration_id: row.id },
        holdExpiresAt: row.hold_expires_at,
        registrationId: row.id,
      },
    };
  } catch (e) {
    return fromThrown(e);
  }
}

function fromOutcome(outcome: ConfirmOutcome, status: string | null): VerifyResult {
  switch (outcome) {
    case "confirmed":
    case "late_confirmed":
      return { ok: true, status: "confirmed" };
    case "refund_needed":
      return { ok: true, status: "refund_needed" };
    case "already_processed":
    case "duplicate_event":
      if (status === "confirmed") return { ok: true, status: "confirmed" };
      if (status === "refund_needed" || status === "refunded") return { ok: true, status: "refund_needed" };
      return { ok: true, status: "processing" };
    case "not_captured":
      return { ok: true, status: "processing" };
    case "duplicate_payment":
    case "amount_mismatch":
      return fail("payment_review");
    case "unknown_order":
    case "foreign":
    case "rejected":
      return fail("payment_unverified");
  }
}

/**
 * Called by Checkout's success handler. Verifies the signature with the key secret, checks the registration is the
 * user's own, then confirms through the shared core (re-fetch from Razorpay, notes check, confirm_payment). Calling it
 * again for the same payment returns the same result. Whatever happens here, the webhook confirms independently.
 */
export async function verifyPayment(input: unknown): Promise<VerifyResult> {
  try {
    const cfg = paymentsConfig();
    if (!cfg.enabled) return fail("paid_event");
    const v = VerifyInput.safeParse(input);
    if (!v.success) return fail("payment_unverified");
    const { user } = await getAuthState();
    if (!user) return fail("not_signed_in");
    if (!(await verifyCheckoutSignature(cfg.keySecret, v.data.orderId, v.data.paymentId, v.data.signature))) {
      return fail("payment_unverified");
    }

    const db = await createClient();
    const { data: own, error } = await db
      .from("registrations")
      .select("id, event:events(slug)")
      .eq("id", v.data.registrationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return { ok: false, error: errorFromDb(error) };
    if (!own) return fail("registration_not_found");

    const res = await confirmVerifiedPayment(
      { creds: { keyId: cfg.keyId, keySecret: cfg.keySecret }, fetch: httpFetch, db: createAdminClient(cfg.serviceRoleKey) },
      { registrationId: own.id, orderId: v.data.orderId, paymentId: v.data.paymentId, source: "client_verify" },
    );
    if (res.outcome !== "foreign" && res.outcome !== "not_captured") refresh(slugOf(own.event));
    return fromOutcome(res.outcome, res.status);
  } catch {
    // Razorpay or the database was unreachable (retryable): the webhook still confirms; My tickets shows the outcome.
    return fail("payment_processing");
  }
}
