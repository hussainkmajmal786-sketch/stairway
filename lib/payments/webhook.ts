import { z } from "zod";
import type { AdminClient } from "@/lib/supabase/admin";
import { confirmVerifiedPayment } from "./confirm";
import { verifyWebhookSignature } from "./crypto";
import { ORDER_ID, PAYMENT_ID, REFUND_ID, RazorpayError, type FetchLike, type RazorpayCredentials } from "./razorpay";

// Razorpay webhook, kept CPU-light for Workers: size cap → signature over the RAW body (constant time) → one
// JSON.parse → notes check → at most one Razorpay GET and one RPC. The Razorpay account is shared with Fund Easy, so
// anything that is not an order/refund we created (notes.source = "stairway" + a registration id) is acknowledged
// with 200 and ignored, before any DB call. Status policy: 413/401/400 only for an oversize, unsigned or non-JSON
// body; 503 while a payment is not captured yet; a thrown error (route → 500) only for transient failures (database,
// network, Razorpay 5xx/429/auth); everything final — handled, ignored, duplicate, refused — is 200 so Razorpay
// stops retrying. Logs carry only the event id, an outcome and a short code: never ids, notes, bodies or secrets.

export const MAX_WEBHOOK_BYTES = 64 * 1024;

export interface WebhookDeps {
  webhookSecret: string;
  creds: RazorpayCredentials;
  fetch: FetchLike;
  /** Created lazily: ignored events never build a service-role client. */
  db: () => AdminClient;
}
export interface WebhookRequest {
  rawBody: string;
  signature: string | null;
  /** `x-razorpay-event-id`: unique per event, repeated on redelivery. */
  eventId: string | null;
}
export interface WebhookResponse {
  status: number;
  body: { ok: boolean; result: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
const SQLSTATE = /^[A-Z0-9]{5}$/;
const Notes = z.record(z.string(), z.unknown()).catch({});
const Envelope = z.object({ event: z.string().max(60), payload: z.record(z.string(), z.unknown()) });
const OrderPaid = z.object({
  order: z.object({ entity: z.object({ id: z.string().regex(ORDER_ID), notes: Notes }) }),
  payment: z.object({ entity: z.object({ id: z.string().regex(PAYMENT_ID), order_id: z.string().nullable() }) }),
});
const RefundProcessed = z.object({
  refund: z.object({
    entity: z.object({
      id: z.string().regex(REFUND_ID),
      payment_id: z.string().regex(PAYMENT_ID),
      // mark_refunded takes a Postgres int.
      amount: z.number().int().positive().max(2_147_483_647),
      notes: Notes,
    }),
  }),
});
const MarkResult = z.object({ outcome: z.string().regex(/^[a-z_]{1,40}$/) });

/** mark_refunded's input refusals: no retry will ever fix them. */
const PERMANENT_REFUND: ReadonlySet<string> = new Set(["invalid_source", "invalid_refund", "invalid_event"]);

/**
 * Outcomes for an event whose notes are ours that need a human: money moved but nothing (or something odd) was
 * recorded. The database keeps amount_mismatch / duplicate_payment / partial_refund on its attention list itself;
 * these are the ones it cannot store (review M-3), so the Worker log is the only trace.
 */
const ATTENTION: ReadonlySet<string> = new Set([
  "unknown_order", "foreign", "rejected", "razorpay_rejected", "unknown_registration", "unknown_payment",
  "ignored:mismatch",
]);

/** The validated `x-razorpay-event-id`, or null (a malformed id is dropped, never stored or logged). */
export function cleanEventId(eventId: string | null): string | null {
  return eventId && EVENT_ID.test(eventId) ? eventId : null;
}

/** A retryable database failure; carries only the SQLSTATE (never database text). */
export class WebhookDbError extends Error {
  constructor(readonly code: string) {
    super(`database call failed (${code})`);
    this.name = "WebhookDbError";
  }
}

/** A short, non-secret code for a thrown error: Razorpay's sanitised code, a SQLSTATE, or the error name. */
export function errorCode(e: unknown): string {
  if (e instanceof RazorpayError) return `razorpay_${e.code}`;
  if (e instanceof WebhookDbError) return `db_${e.code}`;
  if (!(e instanceof Error)) return "unknown";
  // confirm.ts throws "confirm_payment failed (<SQLSTATE>)": surface the SQLSTATE, never the rest.
  const state = /\(([A-Z0-9]{5})\)$/.exec(e.message)?.[1];
  return state ? `db_${state}` : e.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "Error";
}

function attention(eventId: string | null, outcome: string, code?: string) {
  console.warn("razorpay webhook attention", JSON.stringify({ event: eventId ?? "none", outcome, ...(code ? { code } : {}) }));
}

function done(eventId: string | null, result: string): WebhookResponse {
  if (ATTENTION.has(result)) attention(eventId, result);
  return { status: 200, body: { ok: true, result } };
}

const ignored = (reason: string): WebhookResponse => ({ status: 200, body: { ok: true, result: `ignored:${reason}` } });

/** Our notes: source "stairway" and a registration uuid. Returns the registration id, or null. */
function ourRegistration(notes: Record<string, unknown>): string | null {
  return notes.source === "stairway" && typeof notes.registration_id === "string" && UUID.test(notes.registration_id)
    ? notes.registration_id
    : null;
}

/** Razorpay said no for good (bad request / not found / unparseable): retrying cannot help. */
function permanentRazorpay(e: unknown): e is RazorpayError {
  return e instanceof RazorpayError && (e.code === "BAD_RESPONSE" || e.code === "BAD_ID" || e.status === 400 || e.status === 404);
}

export async function handleRazorpayWebhook(deps: WebhookDeps, req: WebhookRequest): Promise<WebhookResponse> {
  if (req.rawBody.length > MAX_WEBHOOK_BYTES) return { status: 413, body: { ok: false, result: "too_large" } };
  if (!(await verifyWebhookSignature(deps.webhookSecret, req.rawBody, req.signature))) {
    return { status: 401, body: { ok: false, result: "bad_signature" } };
  }
  let json: unknown;
  try {
    json = JSON.parse(req.rawBody);
  } catch {
    return { status: 400, body: { ok: false, result: "bad_json" } };
  }
  const env = Envelope.safeParse(json);
  if (!env.success) return ignored("malformed");
  const eventId = cleanEventId(req.eventId);

  if (env.data.event === "order.paid") {
    const p = OrderPaid.safeParse(env.data.payload);
    if (!p.success) return ignored("malformed");
    const order = p.data.order.entity;
    const payment = p.data.payment.entity;
    const registrationId = ourRegistration(order.notes);
    if (!registrationId) return ignored("not_ours");
    if (payment.order_id !== order.id) return done(eventId, "ignored:mismatch");
    let res: Awaited<ReturnType<typeof confirmVerifiedPayment>>;
    try {
      res = await confirmVerifiedPayment(
        { creds: deps.creds, fetch: deps.fetch, db: deps.db() },
        {
          registrationId,
          orderId: order.id,
          paymentId: payment.id,
          source: "webhook",
          eventId,
          eventName: "order.paid",
          orderNotes: { source: "stairway", registration_id: registrationId },
        },
      );
    } catch (e) {
      if (permanentRazorpay(e)) {
        attention(eventId, "razorpay_rejected", errorCode(e));
        return { status: 200, body: { ok: true, result: "razorpay_rejected" } };
      }
      throw e;
    }
    if (res.outcome === "not_captured") return { status: 503, body: { ok: false, result: "not_captured" } };
    return done(eventId, res.outcome);
  }

  if (env.data.event === "refund.processed") {
    const p = RefundProcessed.safeParse(env.data.payload);
    if (!p.success) return ignored("malformed");
    const refund = p.data.refund.entity;
    const registrationId = ourRegistration(refund.notes);
    if (!registrationId) {
      // A refund made by hand in the Razorpay dashboard carries no notes, so it is not reflected on the ticket
      // (go-live checklist step 7). Safe marker only: no ids, amounts or secrets.
      console.info("razorpay webhook", JSON.stringify({ event: eventId ?? "none", outcome: "refund_not_tracked" }));
      return ignored("not_ours");
    }
    const { data, error } = await deps.db().rpc("mark_refunded", {
      p_registration_id: registrationId,
      p_payment_id: refund.payment_id,
      p_refund_id: refund.id,
      p_amount_paise: refund.amount,
      p_source: "webhook",
      p_event_id: eventId ?? undefined,
    });
    if (error) {
      if (error.code === "P0001" && PERMANENT_REFUND.has(error.message?.trim() ?? "")) return done(eventId, "rejected");
      throw new WebhookDbError(typeof error.code === "string" && SQLSTATE.test(error.code) ? error.code : "nocode");
    }
    const parsed = MarkResult.safeParse(data);
    if (!parsed.success) throw new WebhookDbError("shape");
    return done(eventId, parsed.data.outcome);
  }

  if (env.data.event === "refund.failed") {
    // Not subscribed by default; if someone enables it, leave a trace so a failed refund is not silently lost.
    attention(eventId, "refund_failed");
  }
  return ignored("event_not_handled");
}
