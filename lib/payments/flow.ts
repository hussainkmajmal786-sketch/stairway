import { registrationError, type RegistrationError } from "@/lib/registration/errors";
import { ticketPath } from "@/lib/registration/cta";
import type { VerifyResult } from "./actions";
import type { CheckoutOutcome } from "./checkout";

// Pure decisions of the pay flow (usePayFlow, RegistrationForm), kept separate so they are unit-tested.

export type FlowStep = { kind: "navigate"; href: string } | { kind: "error"; error: RegistrationError };

/** null = paid, carry on to verification. `abandonTo` = where the form sends people who closed Checkout. */
export function afterCheckout(kind: CheckoutOutcome["kind"], abandonTo: string | null): FlowStep | null {
  if (kind === "paid") return null;
  if (abandonTo) return { kind: "navigate", href: abandonTo };
  return { kind: "error", error: registrationError(kind === "unavailable" ? "checkout_unavailable" : "payment_cancelled") };
}

/** Success, and outcomes the ticket page explains from the server's state (recovery "tickets"), go to the ticket. */
export function afterVerify(res: VerifyResult, ticketHref: string): FlowStep {
  if (res.ok || res.error.recovery === "tickets") return { kind: "navigate", href: `${ticketHref}?paid=1` };
  return { kind: "error", error: res.error };
}

export type RegisteredStep = { kind: "pay"; registrationId: string } | { kind: "navigate"; href: string };

/**
 * What the registration form does with a successful registerForEvent result. A `pending_payment` hold goes to the
 * payment step; only confirmed / waitlisted seats get the "You're in" ticket copy (?new=1).
 */
export function afterRegister(res: {
  registrationId: string;
  status: "confirmed" | "waitlisted" | "pending_payment";
}): RegisteredStep {
  if (res.status === "pending_payment") return { kind: "pay", registrationId: res.registrationId };
  return { kind: "navigate", href: `${ticketPath(res.registrationId)}?new=1` };
}
