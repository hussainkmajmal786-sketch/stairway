import { describe, expect, it } from "vitest";
import { errorFromDb, REGISTRATION_ERROR_CODES, registrationError } from "@/lib/registration/errors";

// Every `raise exception '<code>'` in private.register_for_event / private.cancel_registration.
const REGISTER_CODES = [
  "not_signed_in", "not_onboarded", "event_not_found", "paid_event", "not_open_yet", "registration_closed",
  "invalid_answers", "already_registered",
] as const;
const CANCEL_CODES = ["not_signed_in", "registration_not_found", "not_cancellable", "paid_cancel_not_supported", "event_started"] as const;

describe("errorFromDb", () => {
  it("maps RPC error codes raised as messages", () => {
    expect(errorFromDb({ message: "already_registered", code: "P0001" })).toMatchObject({ code: "already_registered", recovery: "tickets" });
    expect(errorFromDb({ message: "registration_closed", code: "P0001" })).toMatchObject({ code: "registration_closed", recovery: "event" });
    expect(errorFromDb({ message: "not_onboarded" }).recovery).toBe("onboarding");
  });
  it("maps every code the register and cancel RPCs raise", () => {
    for (const c of [...REGISTER_CODES, ...CANCEL_CODES]) {
      expect(errorFromDb({ message: c, code: "P0001" }).code).toBe(c);
    }
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
