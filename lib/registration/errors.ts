export const REGISTRATION_ERROR_CODES = [
  "not_signed_in", "not_onboarded", "event_not_found", "paid_event", "not_open_yet", "registration_closed",
  "invalid_answers", "invalid_input", "already_registered", "registration_not_found", "not_cancellable",
  "paid_cancel_not_supported", "event_started", "profile_save_failed", "busy", "network", "unknown",
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
};

export function registrationError(code: RegistrationErrorCode): RegistrationError {
  return { code, ...COPY[code] };
}

/**
 * Codes the RPCs raise as the exception message (errcode P0001): private.register_for_event raises the first
 * eight, private.cancel_registration raises not_signed_in plus the last four.
 */
const DB_CODES: ReadonlySet<string> = new Set<RegistrationErrorCode>([
  "not_signed_in", "not_onboarded", "event_not_found", "paid_event", "not_open_yet", "registration_closed",
  "invalid_answers", "already_registered",
  "registration_not_found", "not_cancellable", "paid_cancel_not_supported", "event_started",
]);

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
  if (code === "23505") return registrationError("already_registered");
  if (AUTH_CODES.has(code)) return registrationError("not_signed_in");
  if (BUSY_SQLSTATES.has(code)) return registrationError("busy");
  if (NETWORK_RE.test(msg)) return registrationError("network");
  return registrationError("unknown");
}
