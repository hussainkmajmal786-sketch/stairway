export const REGISTRATION_ERROR_CODES = [
  "not_signed_in", "not_onboarded", "event_not_found", "paid_event", "not_open_yet", "registration_closed",
  "invalid_answers", "invalid_input", "already_registered", "registration_not_found", "not_cancellable",
  "paid_cancel_not_supported", "event_started", "profile_save_failed", "busy", "network", "unknown",
  "refund_pending", "hold_expired", "payment_cancelled", "payment_failed", "payment_unverified", "payment_processing",
  "payment_review", "checkout_unavailable",
] as const;
export type RegistrationErrorCode = (typeof REGISTRATION_ERROR_CODES)[number];

/**
 * What the UI offers next. "event" links back to the (published) event page; "events" links to the schedule (used when
 * the event itself may be gone, so we never link to a 404); "reload" reloads the page to pick up changed questions.
 */
export const RECOVERIES = ["retry", "reload", "sign_in", "onboarding", "tickets", "event", "events", "fix_fields"] as const;
export type Recovery = (typeof RECOVERIES)[number];

export interface RegistrationError {
  code: RegistrationErrorCode;
  message: string;
  recovery: Recovery;
}

const COPY: Record<RegistrationErrorCode, { message: string; recovery: Recovery }> = {
  not_signed_in: { message: "Your session has ended. Sign in again to continue.", recovery: "sign_in" },
  not_onboarded: { message: "Finish setting up your profile before registering.", recovery: "onboarding" },
  event_not_found: { message: "We couldn't find this session. It may have been unpublished.", recovery: "events" },
  paid_event: { message: "Paid registration isn't open yet for this session.", recovery: "event" },
  not_open_yet: { message: "Registration for this session hasn't opened yet.", recovery: "event" },
  registration_closed: { message: "Registration for this session has closed.", recovery: "event" },
  // Only the RPC raises this, after the server already accepted the answers: the questions changed meanwhile.
  invalid_answers: {
    message: "The questions for this session have changed. Reload the page to see the latest form.",
    recovery: "reload",
  },
  invalid_input: { message: "A few fields need a look before you can register.", recovery: "fix_fields" },
  already_registered: { message: "You're already registered for this session.", recovery: "tickets" },
  registration_not_found: { message: "We couldn't find that registration.", recovery: "tickets" },
  not_cancellable: { message: "This registration can't be cancelled any more.", recovery: "tickets" },
  paid_cancel_not_supported: {
    message: "Paid registrations are cancelled by the organisers. Contact us about a refund.",
    recovery: "tickets",
  },
  event_started: { message: "This session has already started, so it can't be cancelled.", recovery: "tickets" },
  profile_save_failed: { message: "We couldn't save your details. Please try again.", recovery: "retry" },
  busy: { message: "Lots of people are registering right now. Please try again in a moment.", recovery: "retry" },
  network: { message: "We couldn't reach the server. Check your connection and try again.", recovery: "retry" },
  unknown: { message: "Something went wrong on our side. Please try again.", recovery: "retry" },
  // Raised by register_for_event while a cancelled paid seat still waits for its refund.
  refund_pending: {
    message: "Your refund for this session is still being processed, so you can't register again yet.",
    recovery: "tickets",
  },
  // Raised by attach_payment_order (and refused by createPaymentOrder) once the seat hold has run out.
  hold_expired: {
    message: "Your 15-minute seat hold ran out before the payment finished. Reload to start again.",
    recovery: "reload",
  },
  // The rest come from the checkout flow (server actions / Razorpay Checkout), never from a DB message.
  payment_cancelled: {
    message: "The payment was cancelled. Your seat stays held until the timer runs out, so you can try again.",
    recovery: "retry",
  },
  payment_failed: {
    message: "The payment didn't go through. You can try again or use another payment method.",
    recovery: "retry",
  },
  payment_unverified: {
    message: "We couldn't verify this payment here. If money left your account it is safe: My tickets shows the final status within a few minutes.",
    recovery: "tickets",
  },
  payment_processing: {
    message: "Your payment is still being confirmed. My tickets shows the result in a minute or two.",
    recovery: "tickets",
  },
  payment_review: {
    message: "We received a payment we couldn't match to a seat. The organisers will check it and refund it if needed.",
    recovery: "tickets",
  },
  checkout_unavailable: {
    message: "The payment window couldn't load. Check your connection or pause content blockers, then try again.",
    recovery: "retry",
  },
};

export function registrationError(code: RegistrationErrorCode): RegistrationError {
  return { code, ...COPY[code] };
}

/**
 * Codes the RPCs raise as the exception message (errcode P0001) that a member may see: register_for_event (v2) raises
 * not_signed_in … invalid_answers, refund_pending and already_registered; cancel_registration (v2) raises
 * not_signed_in, registration_not_found, not_cancellable and event_started; attach_payment_order raises
 * not_signed_in, registration_not_found and hold_expired. paid_cancel_not_supported is only raised by the Phase 3
 * cancel_registration (replaced) and stays mapped harmlessly. Codes not listed here (invalid_order, amount_mismatch
 * and the service-role functions' invalid_source / invalid_payment / invalid_event / payment_conflict /
 * invalid_refund / not_refundable / refund_in_progress / outbox_row_not_found) mean a server bug or tampering and read
 * as "unknown".
 */
const DB_CODES: ReadonlySet<string> = new Set<RegistrationErrorCode>([
  "not_signed_in", "not_onboarded", "event_not_found", "paid_event", "not_open_yet", "registration_closed",
  "invalid_answers", "already_registered",
  "registration_not_found", "not_cancellable", "paid_cancel_not_supported", "event_started",
  "refund_pending", "hold_expired",
]);

/** DB codes shown as another code: attach_payment_order with the database payments flag off. */
const DB_ALIASES: ReadonlyMap<string, RegistrationErrorCode> = new Map([["payments_disabled", "paid_event"]]);

/** Contention on the event row lock: lock_timeout (55P03), statement_timeout (57014), serialization/deadlock (40xxx). */
const BUSY_SQLSTATES: ReadonlySet<string> = new Set(["55P03", "57014", "40001", "40P01"]);
/** PostgREST JWT errors (expired / invalid / missing claims): the session really is gone. */
export const JWT_ERROR_CODES: ReadonlySet<string> = new Set(["PGRST301", "PGRST302", "PGRST303"]);
/** JWT errors plus insufficient_privilege (an RPC call without a usable session). */
const AUTH_CODES: ReadonlySet<string> = new Set(["42501", ...JWT_ERROR_CODES]);
const NETWORK_RE = /fetch failed|failed to fetch|networkerror|network request failed|load failed/i;

export function errorFromDb(err: { message?: string | null; code?: string | null } | null | undefined): RegistrationError {
  const msg = err?.message?.trim() ?? "";
  const code = err?.code ?? "";
  if (DB_CODES.has(msg)) return registrationError(msg as RegistrationErrorCode);
  const alias = DB_ALIASES.get(msg);
  if (alias) return registrationError(alias);
  if (code === "23505") return registrationError("already_registered");
  if (AUTH_CODES.has(code)) return registrationError("not_signed_in");
  if (BUSY_SQLSTATES.has(code)) return registrationError("busy");
  if (NETWORK_RE.test(msg)) return registrationError("network");
  return registrationError("unknown");
}
