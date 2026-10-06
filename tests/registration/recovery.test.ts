import { describe, expect, it } from "vitest";
import { RECOVERIES, REGISTRATION_ERROR_CODES, registrationError } from "@/lib/registration/errors";
import { RECOVERY_ACTIONS, recoveryActions, SCHEDULE_HREF, type RecoveryContext } from "@/lib/registration/recovery";

const form: RecoveryContext = { slug: "seeing-machines", fallbackUrl: "https://forms.gle/abc", canRetry: true, canFixFields: true };
const bare: RecoveryContext = { fallbackUrl: null, canRetry: false, canFixFields: false };

describe("recovery actions", () => {
  it("covers exactly the Recovery values", () => {
    expect(Object.keys(RECOVERY_ACTIONS).sort()).toEqual([...RECOVERIES].sort());
  });

  it("maps every registration error code to a covered recovery with at least one action", () => {
    for (const code of REGISTRATION_ERROR_CODES) {
      const { recovery } = registrationError(code);
      expect(RECOVERIES, code).toContain(recovery);
      expect(recoveryActions(recovery, form).length, code).toBeGreaterThan(0);
      // Without slug / callbacks (e.g. the ticket page) only fix_fields may have nothing to offer.
      if (recovery !== "fix_fields") expect(recoveryActions(recovery, bare).length, code).toBeGreaterThan(0);
    }
  });

  it("offers a reload for changed questions and the schedule for a vanished event", () => {
    expect(recoveryActions(registrationError("invalid_answers").recovery, form)).toEqual([{ kind: "reload", label: "Reload the form" }]);
    expect(recoveryActions(registrationError("event_not_found").recovery, form)).toEqual([
      { kind: "link", label: "See all sessions", href: SCHEDULE_HREF, primary: false },
    ]);
  });

  it("retries in place when possible, else reloads, and offers the fallback form", () => {
    expect(recoveryActions("retry", form).map((a) => a.kind)).toEqual(["retry", "external"]);
    expect(recoveryActions("retry", bare).map((a) => a.kind)).toEqual(["reload"]);
  });

  it("builds internal, encoded return paths", () => {
    expect(recoveryActions("sign_in", form)).toEqual([
      { kind: "link", label: "Sign in", href: "/login?next=%2Fevents%2Fseeing-machines%2Fregister", primary: true },
    ]);
    expect(recoveryActions("onboarding", bare)[0]).toMatchObject({ href: "/onboarding?next=%2Fme%2Ftickets" });
    const ticket = { ...bare, here: "/me/tickets/33333333-3333-4333-8333-333333333333" };
    expect(recoveryActions("sign_in", ticket)[0]).toMatchObject({
      href: "/login?next=%2Fme%2Ftickets%2F33333333-3333-4333-8333-333333333333",
    });
    expect(recoveryActions("event", form)[0]).toMatchObject({ href: "/events/seeing-machines" });
    expect(recoveryActions("event", bare)[0]).toMatchObject({ href: SCHEDULE_HREF });
    for (const r of RECOVERIES) {
      for (const a of recoveryActions(r, form)) {
        if (a.kind === "link") expect(a.href.startsWith("/") && !a.href.startsWith("//")).toBe(true);
        if (a.kind === "external") expect(a.href.startsWith("https://")).toBe(true);
      }
    }
  });
});
