"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { createPaymentOrder, verifyPayment, type CreateOrderResult, type VerifyResult } from "@/lib/payments/actions";
import { openCheckout } from "@/lib/payments/checkout";
import { afterCheckout, afterVerify, type FlowStep } from "@/lib/payments/flow";
import { ticketPath } from "@/lib/registration/cta";
import { registrationError, type RegistrationError } from "@/lib/registration/errors";

export type PayPhase = "idle" | "creating" | "checkout" | "verifying";

/**
 * Order (server) -> Razorpay Checkout -> signature verify (server) -> ticket page. The ticket page always renders the
 * server's status, so a closed tab, a failed verify or a network error never leaves a wrong state on screen.
 * Analytics carry the step number and error codes only, never registration, order or payment ids.
 */
export function usePayFlow(opts: { step: number; abandonTo?: (registrationId: string) => string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [error, setError] = useState<RegistrationError | null>(null);
  const running = useRef(false);
  const { step, abandonTo } = opts;

  const apply = useCallback(
    (s: FlowStep) => {
      if (s.kind === "navigate") {
        router.push(s.href);
        return;
      }
      setError(s.error);
      setPhase("idle");
      running.current = false;
    },
    [router],
  );

  const pay = useCallback(
    async (registrationId: string) => {
      if (running.current) return;
      running.current = true;
      setError(null);
      setPhase("creating");
      track("payment_start", { step });

      let order: CreateOrderResult;
      try {
        order = await createPaymentOrder(registrationId);
      } catch {
        order = { ok: false, error: registrationError("network") };
      }
      if (!order.ok) {
        track("payment_error", { step, code: order.error.code });
        if (order.error.code === "hold_expired") router.refresh();
        apply({ kind: "error", error: order.error });
        return;
      }

      setPhase("checkout");
      const outcome = await openCheckout(order.checkout);
      if (outcome.kind !== "paid") {
        track("payment_dismissed", { step, kind: outcome.kind });
        const next = afterCheckout(outcome.kind, abandonTo ? abandonTo(registrationId) : null);
        apply(next ?? { kind: "error", error: registrationError("payment_cancelled") });
        return;
      }

      setPhase("verifying");
      let res: VerifyResult;
      try {
        res = await verifyPayment({
          registrationId, orderId: outcome.orderId, paymentId: outcome.paymentId, signature: outcome.signature,
        });
      } catch {
        res = { ok: false, error: registrationError("payment_processing") };
      }
      track(res.ok ? "payment_success" : "payment_error", res.ok ? { step, status: res.status } : { step, code: res.error.code });
      apply(afterVerify(res, ticketPath(registrationId)));
    },
    [abandonTo, apply, router, step],
  );

  return { pay, phase, busy: phase !== "idle", error };
}
