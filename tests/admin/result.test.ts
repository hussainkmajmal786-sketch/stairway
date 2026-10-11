import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fail, fromZod, mapDbError } from "@/lib/admin/result";

describe("mapDbError", () => {
  it.each([
    ["forbidden", "P0001", "forbidden"],
    ["new row violates row-level security policy", "42501", "forbidden"],
    ["society_locked", "42501", "locked"],
    ["slug_locked", "P0001", "locked"],
    ["price_locked", "P0001", "locked"],
    ["ticket_locked", "P0001", "locked"],
    ["capacity_below_taken", "P0001", "locked"],
    ["has_registrations", "P0001", "locked"],
    ["use_cancel_event", "P0001", "locked"],
    ["event_cancelled", "P0001", "locked"],
    ["last_super_admin", "P0001", "locked"],
    ["open_registrations", "P0001", "locked"],
    ["admin_account", "P0001", "locked"],
    ["not_cancellable", "P0001", "locked"],
    ["already_checked_in", "P0001", "locked"],
    ["not_checked_in", "P0001", "locked"],
    ["invalid_invite", "P0001", "not_found"],
    ["duplicate key value violates unique constraint", "23505", "conflict"],
    ["new row violates check constraint", "23514", "invalid_input"],
    ["invalid input syntax for type uuid", "22P02", "invalid_input"],
    ["null value in column", "23502", "invalid_input"],
    ["TypeError: fetch failed", null, "unavailable"],
  ])("maps %s (%s) to %s", (message, code, expected) => {
    expect(mapDbError({ message, code }).code).toBe(expected);
  });

  it("gives plain language for locked errors and the invite message", () => {
    expect(mapDbError({ message: "price_locked" }).message).toMatch(/price/i);
    expect(mapDbError({ message: "invalid_invite" }).message).toBe("This invite link is invalid, used or expired.");
  });

  it("never leaks SQL text for unknown errors", () => {
    const e = mapDbError({ message: 'relation "private.secret_table" does not exist at character 15', code: "42P01" });
    expect(e.code).toBe("unknown");
    expect(e.message).not.toMatch(/relation|secret|private|character/i);
  });
  it("handles null", () => {
    expect(mapDbError(null).code).toBe("unknown");
  });
});

describe("fromZod / fail", () => {
  it("keys field errors by the issue path", () => {
    const r = z.object({ title: z.string().min(3), nested: z.object({ n: z.number() }) }).safeParse({ title: "a", nested: { n: "x" } });
    expect(r.success).toBe(false);
    if (r.success) return;
    const e = fromZod(r.error);
    expect(e.code).toBe("invalid_input");
    expect(Object.keys(e.fieldErrors ?? {}).sort()).toEqual(["nested.n", "title"]);
  });
  it("fail() carries a default message", () => {
    expect(fail("forbidden")).toEqual({ ok: false, error: { code: "forbidden", message: expect.any(String) } });
  });
});
