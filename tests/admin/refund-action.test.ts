import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));
vi.mock("@/lib/payments/config", () => ({ paymentsConfig: vi.fn() }));
vi.mock("@/lib/payments/refunds", () => ({ refundRegistration: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ tag: "service" })) }));

import { authorize } from "@/lib/admin/auth";
import { refundRegistrationAction } from "@/lib/admin/refund-action";
import { paymentsConfig } from "@/lib/payments/config";
import { refundRegistration } from "@/lib/payments/refunds";
import { createAdminClient } from "@/lib/supabase/admin";
import { fakeDb, rpcCalls } from "./fake-db";

const REG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const KEY_ID = "rzp_test_ABCDEFGH12345678";
const KEY_SECRET = "super-secret-key-value-1234";
const CFG = {
  enabled: true as const, keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: "whsec-0000000000",
  serviceRoleKey: "service-role-key-0000000000",
};

const asSuper = (db: unknown) =>
  vi.mocked(authorize).mockResolvedValue({ ok: true, ctx: { userId: "u", isSuper: true, societyIds: [] }, db: db as never, societyId: null });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(paymentsConfig).mockReturnValue(CFG);
});

const paid = {
  "registrations.select": { data: { status: "refund_needed", razorpay_payment_id: "pay_ABCDEFGHIJKLMN" }, error: null },
};

describe("refundRegistrationAction", () => {
  it("is super-admin only", async () => {
    vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "x" } });
    expect(await refundRegistrationAction(REG)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(authorize).toHaveBeenCalledWith({ kind: "super" });
    expect(refundRegistration).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("rejects a malformed id before authorising", async () => {
    expect(await refundRegistrationAction("nope")).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(authorize).not.toHaveBeenCalled();
  });
  it("is disabled when the environment flag is off", async () => {
    const { db } = fakeDb({ "rpc.admin_payments_flag": { data: true, error: null }, ...paid });
    asSuper(db);
    vi.mocked(paymentsConfig).mockReturnValue({ enabled: false });
    expect(await refundRegistrationAction(REG)).toMatchObject({ ok: false, error: { code: "payments_disabled" } });
    expect(refundRegistration).not.toHaveBeenCalled();
  });
  it("is disabled when the database flag is off", async () => {
    const { db } = fakeDb({ "rpc.admin_payments_flag": { data: false, error: null }, ...paid });
    asSuper(db);
    expect(await refundRegistrationAction(REG)).toMatchObject({ ok: false, error: { code: "payments_disabled" } });
    expect(refundRegistration).not.toHaveBeenCalled();
  });
  it.each([
    [{ status: "cancelled", razorpay_payment_id: "pay_X" }],
    [{ status: "confirmed", razorpay_payment_id: null }],
    [null],
  ])("locks when the state is not refundable (%j)", async (row) => {
    const { db } = fakeDb({ "rpc.admin_payments_flag": { data: true, error: null }, "registrations.select": { data: row, error: null } });
    asSuper(db);
    expect(await refundRegistrationAction(REG)).toMatchObject({ ok: false, error: { code: "locked" } });
    expect(refundRegistration).not.toHaveBeenCalled();
  });
  it("refunds once with a service client from the config key and writes both audit rows (numbers/booleans only)", async () => {
    const { db, calls } = fakeDb({
      "rpc.admin_payments_flag": { data: true, error: null },
      "rpc.log_admin_event": { data: null, error: null },
      ...paid,
    });
    asSuper(db);
    vi.mocked(refundRegistration).mockResolvedValue({ ok: true, outcome: "refunded", refundId: "rfnd_secretid" });
    const r = await refundRegistrationAction(REG);
    expect(r).toEqual({ ok: true, data: { outcome: "refunded" } });
    expect(refundRegistration).toHaveBeenCalledTimes(1);
    expect(createAdminClient).toHaveBeenCalledWith(CFG.serviceRoleKey);
    const [deps, id] = vi.mocked(refundRegistration).mock.calls[0];
    expect(id).toBe(REG);
    expect(deps.creds).toEqual({ keyId: KEY_ID, keySecret: KEY_SECRET });
    const audits = rpcCalls(calls, "log_admin_event").map((c) => c.args[1] as { p_action: string; p_summary: Record<string, unknown> });
    expect(audits.map((a) => a.p_action)).toEqual(["refund.attempt", "refund.result"]);
    for (const a of audits) for (const v of Object.values(a.p_summary)) expect(["number", "boolean"]).toContain(typeof v);
    expect(JSON.stringify(audits)).not.toMatch(/rfnd_|pay_|rzp_/);
  });
  it.each([
    [{ ok: false, reason: "in_progress" }, "conflict"],
    [{ ok: false, reason: "not_found" }, "not_found"],
    [{ ok: false, reason: "not_refundable" }, "locked"],
    [{ ok: false, reason: "db_error" }, "unavailable"],
    [{ ok: false, reason: "disabled" }, "payments_disabled"],
    [{ ok: false, reason: "razorpay_error", code: "BAD_REQUEST_ERROR" }, "unavailable"],
  ] as const)("maps %j to %s with fixed copy", async (result, code) => {
    const { db, calls } = fakeDb({
      "rpc.admin_payments_flag": { data: true, error: null },
      "rpc.log_admin_event": { data: null, error: null },
      ...paid,
    });
    asSuper(db);
    vi.mocked(refundRegistration).mockResolvedValue(result as never);
    const r = await refundRegistrationAction(REG);
    expect(r).toMatchObject({ ok: false, error: { code } });
    const text = JSON.stringify(r);
    expect(text).not.toContain(KEY_ID);
    expect(text).not.toContain(KEY_SECRET);
    const last = rpcCalls(calls, "log_admin_event").at(-1)?.args[1] as { p_summary: Record<string, unknown> };
    for (const v of Object.values(last.p_summary)) expect(["number", "boolean"]).toContain(typeof v);
  });
});
