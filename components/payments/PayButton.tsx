"use client";

import { CreditCard, Loader2 } from "lucide-react";
import { ErrorPanel } from "@/components/registration/ErrorPanel";
import { formatInr } from "@/lib/payments/money";
import { usePayFlow, type PayPhase } from "./usePayFlow";

const BUSY_TEXT: Record<Exclude<PayPhase, "idle">, string> = {
  creating: "Preparing your payment…",
  checkout: "Waiting for Razorpay…",
  verifying: "Confirming your payment…",
};

/** "Pay ₹X" for a live hold (ticket page). aria-disabled (not disabled) while busy, so focus is never dropped. */
export function PayButton({
  registrationId, amountPaise, step, here,
}: {
  registrationId: string;
  amountPaise: number;
  step: number;
  /** This ticket's path (Sign in returns here). */
  here: string;
}) {
  const { pay, phase, busy, error } = usePayFlow({ step });
  const busyText = phase === "idle" ? "" : BUSY_TEXT[phase];
  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="btn btn-primary btn-lg justify-self-start"
        aria-disabled={busy}
        onClick={() => {
          if (!busy) void pay(registrationId);
        }}
      >
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <CreditCard size={18} strokeWidth={2} aria-hidden />}
        {busy ? busyText : `Pay ${formatInr(amountPaise)}`}
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {busyText}
      </p>
      {error && <ErrorPanel error={error} here={here} fallbackUrl={null} onRetry={() => void pay(registrationId)} />}
    </div>
  );
}
