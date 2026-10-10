import { formatInr } from "@/lib/payments/money";
import { HoldCountdown } from "./HoldCountdown";
import { PayButton } from "./PayButton";

/** "Complete payment" for a live hold on the ticket page: countdown + Pay button (Checkout loads only on click). */
export function PaymentPanel({
  registrationId, holdExpiresAt, amountPaise, step, here,
}: {
  registrationId: string;
  holdExpiresAt: string;
  amountPaise: number;
  step: number;
  here: string;
}) {
  return (
    <section aria-labelledby="pay-h" className="box grid gap-4 p-5 shadow-hard">
      <h2 id="pay-h" className="mono font-bold">Complete payment</h2>
      <p className="text-ink-2">
        Your seat is held for <HoldCountdown expiresAt={holdExpiresAt} className="font-bold text-ink" /> more. Pay{" "}
        {formatInr(amountPaise)} with UPI, card or netbanking to confirm it.
      </p>
      <PayButton registrationId={registrationId} amountPaise={amountPaise} step={step} here={here} />
      <p className="text-xs text-ink-3">
        Payments are processed by Razorpay. When the timer runs out the seat is released; a payment that still arrives is
        confirmed if a seat is free, otherwise refunded.
      </p>
    </section>
  );
}
