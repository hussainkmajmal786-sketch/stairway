import { z } from "zod";
import type { AdminClient } from "@/lib/supabase/admin";
import { REGISTRATION_STATUSES, type RegistrationStatus } from "@/lib/registration/types";
import { fetchOrder, fetchPayment, type FetchLike, type RazorpayCredentials } from "./razorpay";

// The single path from "Razorpay says paid" to a seat, shared by the client verify action and the webhook. Before the
// database is touched: the payment is re-fetched from Razorpay (its order must match), the order's server-set notes
// must name st(AI)rway and this registration (the account is shared with Fund Easy), and the payment must be captured.
// The amount and currency Razorpay captured go to confirm_payment, which refuses anything but the order's amount in INR.
// The caller passes the service-role client; this module never builds one.

export type ConfirmOutcome =
  | "confirmed" | "late_confirmed" | "refund_needed" | "already_processed" | "duplicate_payment"
  | "amount_mismatch" | "duplicate_event" | "unknown_order" | "not_captured" | "foreign"
  /** Razorpay says the payment failed (final): nothing to confirm, no retry. */
  | "payment_failed"
  /** Razorpay says the payment was refunded before we applied it: nothing to confirm, no retry. */
  | "payment_refunded"
  /** confirm_payment raised a permanent refusal (invalid_source / invalid_payment / invalid_event / payment_conflict). */
  | "rejected";

export interface ConfirmInput {
  registrationId: string;
  orderId: string;
  paymentId: string;
  source: "client_verify" | "webhook";
  eventId?: string | null;
  eventName?: string | null;
  /** Notes of the order entity from a signature-verified webhook body (trusted); otherwise the order is fetched. */
  orderNotes?: Record<string, string>;
}

const RpcResult = z.object({
  outcome: z.enum([
    "confirmed", "late_confirmed", "refund_needed", "already_processed", "duplicate_payment",
    "amount_mismatch", "duplicate_event", "unknown_order",
  ]),
  status: z.enum(REGISTRATION_STATUSES).optional(),
});

/**
 * Raised by confirm_payment for input that no retry will ever fix (a malformed source / payment / event id, or a
 * payment id already attached elsewhere). Reported as the outcome "rejected" so the webhook answers 200 and the client
 * stops, instead of retrying forever. Anything else from the database is thrown (retryable).
 */
const PERMANENT: ReadonlySet<string> = new Set(["invalid_source", "invalid_payment", "invalid_event", "payment_conflict"]);

export async function confirmVerifiedPayment(
  deps: { creds: RazorpayCredentials; fetch: FetchLike; db: AdminClient },
  input: ConfirmInput,
): Promise<{ outcome: ConfirmOutcome; status: RegistrationStatus | null }> {
  const payment = await fetchPayment(deps.creds, deps.fetch, input.paymentId);
  if (payment.id !== input.paymentId || payment.order_id !== input.orderId) return { outcome: "foreign", status: null };
  let notes = input.orderNotes;
  if (!notes) {
    const order = await fetchOrder(deps.creds, deps.fetch, input.orderId);
    if (order.id !== input.orderId) return { outcome: "foreign", status: null };
    notes = order.notes;
  }
  if (notes.source !== "stairway" || notes.registration_id !== input.registrationId) return { outcome: "foreign", status: null };
  if (payment.status === "failed") return { outcome: "payment_failed", status: null };
  if (payment.status === "refunded") return { outcome: "payment_refunded", status: null };
  // created / authorized (capture pending): may still become captured, so the caller retries / says "processing".
  if (payment.status !== "captured") return { outcome: "not_captured", status: null };

  const { data, error } = await deps.db.rpc("confirm_payment", {
    p_registration_id: input.registrationId,
    p_order_id: input.orderId,
    p_payment_id: input.paymentId,
    p_amount_paise: payment.amount,
    p_currency: payment.currency,
    p_source: input.source,
    p_event_id: input.eventId ?? undefined,
    p_event_name: input.eventName ?? undefined,
    p_details: { status: payment.status, method: payment.method ?? null },
  });
  if (error) {
    if (error.code === "P0001" && PERMANENT.has(error.message?.trim() ?? "")) return { outcome: "rejected", status: null };
    // Never echo database text (it may name tables or values); the SQLSTATE is safe and useful in logs.
    const code = typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : "no code";
    throw new Error(`confirm_payment failed (${code})`);
  }
  const parsed = RpcResult.safeParse(data);
  if (!parsed.success) throw new Error("confirm_payment returned an unexpected shape");
  return { outcome: parsed.data.outcome, status: parsed.data.status ?? null };
}
