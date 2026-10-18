import type { z } from "zod";

export type AdminErrorCode =
  | "not_signed_in"
  | "forbidden"
  | "invalid_input"
  | "conflict"
  | "too_many"
  | "locked"
  | "not_found"
  | "payments_disabled"
  | "unavailable"
  | "unknown";

export interface AdminError {
  code: AdminErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
}

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: AdminError };

const DEFAULT_MESSAGES: Record<AdminErrorCode, string> = {
  not_signed_in: "Please sign in again.",
  forbidden: "You do not have access to do that.",
  invalid_input: "Some fields need attention.",
  conflict: "That conflicts with an existing item.",
  too_many: "That list is too long to reorder in one go (40 items at most).",
  locked: "That change is not allowed right now.",
  not_found: "We could not find that.",
  payments_disabled: "Payments are not enabled, so refunds are unavailable.",
  unavailable: "The service is unavailable. Please try again in a moment.",
  unknown: "Something went wrong. Please try again.",
};

export function fail(
  code: AdminErrorCode,
  message?: string,
  fieldErrors?: Record<string, string>,
): { ok: false; error: AdminError } {
  const error: AdminError = { code, message: message ?? DEFAULT_MESSAGES[code] };
  if (fieldErrors) error.fieldErrors = fieldErrors;
  return { ok: false, error };
}

export function okResult<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

/** Field ids come from the issue path (dot-joined); the first message per field wins. */
export function fromZod(error: z.ZodError): AdminError {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return { code: "invalid_input", message: DEFAULT_MESSAGES.invalid_input, fieldErrors };
}

const LOCKED: Record<string, string> = {
  society_locked: "Only a super admin can move a session to another society.",
  slug_locked: "The web address cannot change after a session has been published.",
  price_locked: "The price cannot change once someone has a paid seat.",
  ticket_locked: "The ticket type and token prefix cannot change once tickets have been issued.",
  capacity_below_taken: "Capacity cannot be lower than the seats already taken.",
  has_registrations: "This session has registrations. Cancel the session instead of moving it to draft.",
  use_cancel_event: "Use Cancel session to cancel a session.",
  event_cancelled: "This session is cancelled and can no longer be changed.",
  last_super_admin: "There must always be at least one super admin.",
  open_registrations: "That account still has a live seat or open payment. Cancel or refund it first.",
  admin_account: "Admin accounts cannot be anonymised.",
  not_cancellable: "That registration cannot be cancelled.",
  already_checked_in: "Already checked in.",
  not_checked_in: "That attendee is not checked in.",
};

/** Match the raised message first (our functions raise bare codes), then the SQLSTATE. Never echoes SQL text. */
export function mapDbError(e: { message?: string | null; code?: string | null } | null): AdminError {
  if (!e) return { code: "unknown", message: DEFAULT_MESSAGES.unknown };
  const message = (e.message ?? "").trim().toLowerCase();
  if (message === "forbidden") return { code: "forbidden", message: DEFAULT_MESSAGES.forbidden };
  if (message === "invalid_invite") {
    return { code: "not_found", message: "This invite link is invalid, used or expired." };
  }
  for (const key of Object.keys(LOCKED)) {
    if (message === key || message.includes(key)) return { code: "locked", message: LOCKED[key] };
  }
  const code = e.code ?? "";
  if (code === "42501") return { code: "forbidden", message: DEFAULT_MESSAGES.forbidden };
  if (code === "23505") return { code: "conflict", message: "That slug or step number is already taken." };
  if (code === "23514" || code === "22P02" || code === "23502") {
    return { code: "invalid_input", message: "Some values are not valid." };
  }
  if (code === "23503") return { code: "locked", message: "That item is still in use." };
  if (/fetch failed|network|timeout|econn|enotfound|unavailable/.test(message) || code === "PGRST000") {
    return { code: "unavailable", message: DEFAULT_MESSAGES.unavailable };
  }
  return { code: "unknown", message: DEFAULT_MESSAGES.unknown };
}
