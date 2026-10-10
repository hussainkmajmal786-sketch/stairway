import { z } from "zod";
import type { CheckoutData } from "./actions";
import { ORDER_ID, PAYMENT_ID } from "./razorpay";

// Razorpay Checkout in the browser. checkout.js is injected on demand, only when a member starts a payment
// (registration form or ticket page): no third-party script on any other page. Every value passed to Checkout comes
// from createPaymentOrder (server), never from page state. Browser-only: the CheckoutData import is type-only.

export const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Checkout closes this long before the hold ends, so a payment never lands on a hold that is about to expire. */
export const CHECKOUT_MARGIN_S = 60;

type RazorpayInstance = { open(): void; on(event: string, cb: (r: unknown) => void): void };
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;
interface CheckoutHost {
  Razorpay?: RazorpayCtor;
  document: { createElement(tag: "script"): HTMLScriptElement; head: { appendChild(node: HTMLScriptElement): unknown } };
}

export type CheckoutOutcome =
  | { kind: "paid"; orderId: string; paymentId: string; signature: string }
  | { kind: "dismissed" }
  | { kind: "unavailable" };

const Success = z.object({
  razorpay_payment_id: z.string().regex(PAYMENT_ID),
  razorpay_order_id: z.string().regex(ORDER_ID),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
});

export function parseCheckoutSuccess(v: unknown): { orderId: string; paymentId: string; signature: string } | null {
  const r = Success.safeParse(v);
  return r.success
    ? { orderId: r.data.razorpay_order_id, paymentId: r.data.razorpay_payment_id, signature: r.data.razorpay_signature }
    : null;
}

/** Seconds Checkout may stay open: time left on the hold minus the margin (at least 1); null when unparsable. */
export function checkoutTimeoutSeconds(holdExpiresAt: string, now: number): number | null {
  const end = Date.parse(holdExpiresAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(1, Math.floor((end - now) / 1000) - CHECKOUT_MARGIN_S);
}

export function checkoutOptions(
  data: CheckoutData,
  handlers: { onSuccess(r: unknown): void; onDismiss(): void },
  now: number = Date.now(),
): Record<string, unknown> {
  const timeout = checkoutTimeoutSeconds(data.holdExpiresAt, now);
  return {
    key: data.keyId,
    order_id: data.orderId,
    amount: data.amountPaise,
    currency: data.currency,
    name: data.name,
    description: data.description,
    prefill: data.prefill,
    notes: data.notes,
    theme: { color: "#1C3FD0" },
    retry: { enabled: true },
    ...(timeout !== null ? { timeout } : {}),
    modal: { ondismiss: handlers.onDismiss, confirm_close: true, escape: true },
    handler: handlers.onSuccess,
  };
}

let loading: Promise<boolean> | null = null;

export function resetCheckoutLoader() {
  loading = null;
}

export function loadCheckoutScript(host: CheckoutHost = window as unknown as CheckoutHost): Promise<boolean> {
  if (host.Razorpay) return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise<boolean>((resolve) => {
    const s = host.document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      loading = null;
      s.remove();
      resolve(false);
    };
    host.document.head.appendChild(s);
  });
  return loading;
}

/** Opens Checkout; resolves once with the outcome. A failed attempt keeps the modal open (Razorpay's retry). */
export async function openCheckout(data: CheckoutData): Promise<CheckoutOutcome> {
  if (!(await loadCheckoutScript())) return { kind: "unavailable" };
  const Razorpay = (window as unknown as CheckoutHost).Razorpay;
  if (!Razorpay) return { kind: "unavailable" };
  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const done = (o: CheckoutOutcome) => {
      if (!settled) {
        settled = true;
        resolve(o);
      }
    };
    try {
      const rzp = new Razorpay(
        checkoutOptions(data, {
          onSuccess: (r) => {
            const p = parseCheckoutSuccess(r);
            // An unparsable success payload is not a dismissal: a payment may exist. "unavailable" sends the member to
            // a retryable error rather than telling them it was cancelled; the webhook still settles any payment.
            done(p ? { kind: "paid", ...p } : { kind: "unavailable" });
          },
          onDismiss: () => done({ kind: "dismissed" }),
        }),
      );
      rzp.open();
    } catch {
      done({ kind: "unavailable" });
    }
  });
}
