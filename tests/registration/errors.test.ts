import { describe, expect, it } from "vitest";
import { errorFromDb, RECOVERIES, REGISTRATION_ERROR_CODES, registrationError } from "@/lib/registration/errors";

// Every `raise exception '<code>'` in private.register_for_event / private.cancel_registration (v2,
// 20261010114443_payments_rpcs.sql) and private.attach_payment_order (20261010154416_payments_review_fixes.sql).
const REGISTER_CODES = [
  "not_signed_in", "not_onboarded", "event_not_found", "paid_event", "not_open_yet", "registration_closed",
  "invalid_answers", "refund_pending", "already_registered",
] as const;
const CANCEL_CODES = ["not_signed_in", "registration_not_found", "not_cancellable", "event_started"] as const;
// Raised only by the Phase 3 cancel_registration (replaced by v2); kept mapped so a not-yet-migrated DB still reads well.
const LEGACY_CODES = ["paid_cancel_not_supported"] as const;
const ATTACH_USER_CODES = ["not_signed_in", "registration_not_found", "hold_expired"] as const;
// Raised by attach (server bugs / tampering) or by service-role functions only: never shown as such to a member.
const INTERNAL_CODES = [
  "invalid_order", "amount_mismatch", "invalid_source", "invalid_payment", "invalid_event", "payment_conflict",
  "invalid_refund", "not_refundable", "refund_in_progress", "outbox_row_not_found",
] as const;

describe("errorFromDb", () => {
  it("maps RPC error codes raised as messages", () => {
    expect(errorFromDb({ message: "already_registered", code: "P0001" })).toMatchObject({ code: "already_registered", recovery: "tickets" });
    expect(errorFromDb({ message: "registration_closed", code: "P0001" })).toMatchObject({ code: "registration_closed", recovery: "event" });
    expect(errorFromDb({ message: "not_onboarded" }).recovery).toBe("onboarding");
  });
  it("maps every code the register and cancel RPCs raise", () => {
    for (const c of [...REGISTER_CODES, ...CANCEL_CODES, ...LEGACY_CODES, ...ATTACH_USER_CODES]) {
      expect(errorFromDb({ message: c, code: "P0001" }).code).toBe(c);
    }
  });
  it("reads payments_disabled (attach with the DB flag off) as paid registration not open yet", () =>
    expect(errorFromDb({ message: "payments_disabled", code: "P0001" })).toMatchObject({ code: "paid_event", recovery: "event" }));
  it("keeps internal and service-role codes generic", () => {
    for (const c of INTERNAL_CODES) expect(errorFromDb({ message: c, code: "P0001" }).code, c).toBe("unknown");
  });
  it("never sends a possibly unpublished event to its own page, and offers a reload for stale questions", () => {
    expect(errorFromDb({ message: "event_not_found", code: "P0001" }).recovery).toBe("events");
    expect(errorFromDb({ message: "invalid_answers", code: "P0001" }).recovery).toBe("reload");
  });
  it("maps unique violations and permission errors", () => {
    expect(errorFromDb({ code: "23505", message: "duplicate key value" }).code).toBe("already_registered");
    expect(errorFromDb({ code: "42501", message: "permission denied for function register_for_event" }).code).toBe("not_signed_in");
    expect(errorFromDb({ code: "PGRST301", message: "JWT expired" }).code).toBe("not_signed_in");
  });
  it("asks for a retry on lock timeouts and cancelled statements", () => {
    for (const code of ["55P03", "57014", "40001", "40P01"]) {
      expect(errorFromDb({ code, message: "canceling statement due to lock timeout" })).toMatchObject({ code: "busy", recovery: "retry" });
    }
  });
  it("recognises network failures", () => {
    expect(errorFromDb({ message: "TypeError: fetch failed" }).code).toBe("network");
    expect(errorFromDb({ message: "Failed to fetch" })).toMatchObject({ code: "network", recovery: "retry" });
  });
  it("does not treat a code embedded in a longer message as that code", () =>
    expect(errorFromDb({ message: "not_signed_in or else", code: "P0001" }).code).toBe("unknown"));
  it("falls back to unknown", () => {
    expect(errorFromDb({ message: "boom" }).code).toBe("unknown");
    expect(errorFromDb(null).code).toBe("unknown");
    expect(errorFromDb(undefined)).toMatchObject({ code: "unknown", recovery: "retry" });
  });
});

describe("registrationError", () => {
  it("has copy and a recovery for every code", () => {
    for (const c of REGISTRATION_ERROR_CODES) {
      const e = registrationError(c);
      expect(e.message.length).toBeGreaterThan(10);
      expect(e.recovery).toBeTruthy();
    }
  });
});

describe("payment errors", () => {
  it("maps the new RPC codes", () => {
    expect(errorFromDb({ message: "refund_pending", code: "P0001" })).toMatchObject({ code: "refund_pending", recovery: "tickets" });
    expect(errorFromDb({ message: "hold_expired", code: "P0001" })).toMatchObject({ code: "hold_expired", recovery: "reload" });
  });
  it("keeps internal attach errors generic", () => {
    expect(errorFromDb({ message: "amount_mismatch", code: "P0001" }).code).toBe("unknown");
    expect(errorFromDb({ message: "invalid_order", code: "P0001" }).code).toBe("unknown");
  });
  it("gives every code a message and a known recovery", () => {
    for (const c of REGISTRATION_ERROR_CODES) {
      const e = registrationError(c);
      expect(e.message.length).toBeGreaterThan(10);
      expect(RECOVERIES).toContain(e.recovery);
    }
  });
  it("offers a retry for a cancelled or failed checkout and My tickets when the outcome is still open", () => {
    expect(registrationError("payment_cancelled").recovery).toBe("retry");
    expect(registrationError("payment_failed").recovery).toBe("retry");
    expect(registrationError("checkout_unavailable").recovery).toBe("retry");
    expect(registrationError("payment_processing").recovery).toBe("tickets");
    expect(registrationError("payment_unverified").recovery).toBe("tickets");
    expect(registrationError("payment_review").recovery).toBe("tickets");
  });
  it("never maps client-only payment codes from a DB message", () => {
    for (const c of ["payment_cancelled", "payment_failed", "payment_unverified", "payment_processing", "payment_review", "checkout_unavailable"]) {
      expect(errorFromDb({ message: c, code: "P0001" }).code, c).toBe("unknown");
    }
  });
});
