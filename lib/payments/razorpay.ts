import { z } from "zod";

// Razorpay REST API v1 over fetch (the Node SDK does not run on Workers). Responses are validated with zod;
// errors carry only the HTTP status and a sanitised Razorpay error code, never the response body, key or secret.
// Credentials are passed in by the caller (from `paymentsConfig()`); this module reads no env itself.

export const RAZORPAY_API = "https://api.razorpay.com/v1";
export const ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;
export const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;
export const REFUND_ID = /^rfnd_[A-Za-z0-9]{6,40}$/;
const TIMEOUT_MS = 8000;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,59}$/;
/** Razorpay responses are a few KB; anything larger is not one we parse (CPU budget on Workers). */
export const MAX_RESPONSE_BYTES = 256 * 1024;

/** Reads at most `max` bytes of the body; returns null when it is larger. Throws if the stream fails mid-read. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * `status` 0 = never reached Razorpay. `code`: BAD_AMOUNT | BAD_ID | NETWORK | TIMEOUT | BAD_RESPONSE | HTTP_<status>
 * | Razorpay's own upper-case error code (e.g. BAD_REQUEST_ERROR).
 */
export class RazorpayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Razorpay request failed (${status} ${code})`);
    this.name = "RazorpayError";
  }
}

// Razorpay returns `notes: []` when there are none; values may be numbers. Normalise to Record<string, string>.
const Notes = z
  .record(z.string(), z.union([z.string(), z.number()]))
  .transform((n) => Object.fromEntries(Object.entries(n).map(([k, v]) => [k, String(v)])))
  .catch({});

const OrderSchema = z.object({
  id: z.string().regex(ORDER_ID),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  notes: Notes,
});
const PaymentSchema = z.object({
  id: z.string().regex(PAYMENT_ID),
  order_id: z.string().nullable(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  method: z.string().nullish(),
  notes: Notes,
});
const RefundSchema = z.object({
  id: z.string().regex(REFUND_ID),
  payment_id: z.string().regex(PAYMENT_ID),
  amount: z.number().int(),
  status: z.string(),
  notes: Notes,
});
const RefundListSchema = z.object({ items: z.array(RefundSchema).max(100) }).transform((c) => c.items);

export type RazorpayOrder = z.output<typeof OrderSchema>;
export type RazorpayPayment = z.output<typeof PaymentSchema>;
export type RazorpayRefund = z.output<typeof RefundSchema>;

async function call<T>(
  creds: RazorpayCredentials,
  f: FetchLike,
  method: "GET" | "POST",
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await f(`${RAZORPAY_API}${path}`, {
      method,
      headers: {
        authorization: `Basic ${btoa(`${creds.keyId}:${creds.keySecret}`)}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const name = (e as { name?: unknown } | null)?.name;
    throw new RazorpayError(0, name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "NETWORK");
  }
  let text: string | null;
  try {
    text = await readCapped(res, MAX_RESPONSE_BYTES);
  } catch (e) {
    // The connection dropped (or the 8 s timeout fired) while reading: transient.
    const name = (e as { name?: unknown } | null)?.name;
    throw new RazorpayError(0, name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "NETWORK");
  }
  if (text === null) throw new RazorpayError(res.status, res.ok ? "BAD_RESPONSE" : `HTTP_${res.status}`);
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const code = (json as { error?: { code?: unknown } } | null)?.error?.code;
    throw new RazorpayError(res.status, typeof code === "string" && ERROR_CODE.test(code) ? code : `HTTP_${res.status}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new RazorpayError(res.status, "BAD_RESPONSE");
  return parsed.data;
}

function checkId(id: string, re: RegExp) {
  if (typeof id !== "string" || !re.test(id)) throw new RazorpayError(0, "BAD_ID");
}

/**
 * Razorpay's minimum is ₹1 (100 paise). The amount always comes from registrations.amount_paise. Orders API has no
 * idempotency header: retries are made safe by reusing the one order attached to a hold (attach_payment_order).
 */
export function createOrder(
  creds: RazorpayCredentials,
  f: FetchLike,
  input: { amountPaise: number; receipt: string; notes: Record<string, string> },
): Promise<RazorpayOrder> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) {
    return Promise.reject(new RazorpayError(0, "BAD_AMOUNT"));
  }
  return call(creds, f, "POST", "/orders", OrderSchema, {
    amount: input.amountPaise,
    currency: "INR",
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  });
}

export async function fetchOrder(creds: RazorpayCredentials, f: FetchLike, id: string): Promise<RazorpayOrder> {
  checkId(id, ORDER_ID);
  return call(creds, f, "GET", `/orders/${id}`, OrderSchema);
}

export async function fetchPayment(creds: RazorpayCredentials, f: FetchLike, id: string): Promise<RazorpayPayment> {
  checkId(id, PAYMENT_ID);
  return call(creds, f, "GET", `/payments/${id}`, PaymentSchema);
}

/**
 * Full refunds only (a second full refund is refused by Razorpay). Callers look for an earlier refund with
 * `fetchRefunds` first after a lapsed lease, so a crashed attempt is never refunded twice.
 */
export async function refundPayment(
  creds: RazorpayCredentials,
  f: FetchLike,
  paymentId: string,
  input: { amountPaise: number; notes: Record<string, string> },
): Promise<RazorpayRefund> {
  checkId(paymentId, PAYMENT_ID);
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 1) throw new RazorpayError(0, "BAD_AMOUNT");
  return call(creds, f, "POST", `/payments/${paymentId}/refund`, RefundSchema, {
    amount: input.amountPaise,
    speed: "normal",
    notes: input.notes,
  });
}

/** Refunds already made for a payment (GET /payments/{id}/refunds). */
export async function fetchRefunds(creds: RazorpayCredentials, f: FetchLike, paymentId: string): Promise<RazorpayRefund[]> {
  checkId(paymentId, PAYMENT_ID);
  return call(creds, f, "GET", `/payments/${paymentId}/refunds`, RefundListSchema);
}
