import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getAuthState: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/payments/config", () => ({ paymentsConfig: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getAuthState } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentsConfig } from "@/lib/payments/config";
import { createPaymentOrder, verifyPayment } from "@/lib/payments/actions";

const UID = "11111111-1111-4111-8111-111111111111";
const EID = "22222222-2222-4222-8222-222222222222";
const RID = "33333333-3333-4333-8333-333333333333";
const ORDER = "order_P4ACT0000001";
const PAY = "pay_P4ACT0000001";
const CFG = {
  enabled: true, keyId: "rzp_test_ABCDEFGH1234", keySecret: "key_secret_value_123",
  webhookSecret: "webhook_secret_value", serviceRoleKey: "service_role_key_value_000000",
} as const;
const SECRETS = [CFG.keySecret, CFG.webhookSecret, CFG.serviceRoleKey];
const sig = (o = ORDER, p = PAY) => createHmac("sha256", CFG.keySecret).update(`${o}|${p}`).digest("hex");
const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();
const future = () => inMs(10 * 60_000);

type Res = { data: unknown; error: unknown };
/** Session (RLS) client: one registrations read; records every query call and every rpc call. */
function sessionDb(row: Res) {
  const rpcCalls: [string, unknown][] = [];
  const queryCalls: unknown[][] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) {
    b[m] = (...args: unknown[]) => {
      queryCalls.push([m, ...args]);
      return b;
    };
  }
  b.maybeSingle = () => Promise.resolve(row);
  const db = {
    from: (t: string) => {
      queryCalls.push(["from", t]);
      return b;
    },
    rpc: (name: string, args: unknown) => {
      rpcCalls.push([name, args]);
      return Promise.resolve({ data: null, error: null });
    },
  };
  vi.mocked(createClient).mockResolvedValue(db as never);
  return { rpcCalls, queryCalls };
}
/** Service-role client: rpc results by function name. */
function adminDb(results: Record<string, Res>) {
  const rpc = vi.fn(async (name: string) => results[name] ?? { data: null, error: null });
  vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
  return rpc;
}
function razorpay(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const f = vi.fn(handler);
  vi.stubGlobal("fetch", f);
  return f;
}
const pendingRow = (over: Record<string, unknown> = {}): Res => ({
  data: { id: RID, event_id: EID, status: "pending_payment", amount_paise: 19900, hold_expires_at: future(), razorpay_order_id: null,
          event: { title: "Seeing Machines", slug: "seeing-machines", status: "published", starts_at: inMs(864e5) }, ...over },
  error: null,
});
const orderJson = (over: Record<string, unknown> = {}) =>
  Response.json({ id: ORDER, amount: 19900, currency: "INR", status: "created", notes: {}, ...over });
const attachOk = (order = ORDER) => ({ attach_payment_order: { data: { order_id: order, hold_expires_at: future() }, error: null } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(paymentsConfig).mockReturnValue(CFG as never);
  vi.mocked(getAuthState).mockResolvedValue({
    user: { id: UID, email: "asha@example.com" },
    profile: { handle: "asha", fullName: "Asha", avatarUrl: null, onboarded: true },
  } as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("createPaymentOrder", () => {
  it("is refused while payments are off, without auth, DB or Razorpay calls", async () => {
    vi.mocked(paymentsConfig).mockReturnValue({ enabled: false });
    const f = razorpay(() => Response.json({}));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "paid_event" } });
    expect(f).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("needs a valid id, a session, a finished profile and the user's own live hold", async () => {
    const f = razorpay(() => orderJson());
    expect(await createPaymentOrder("not-a-uuid")).toMatchObject({ ok: false, error: { code: "registration_not_found" } });
    expect(await createPaymentOrder({ id: RID } as never)).toMatchObject({ ok: false, error: { code: "registration_not_found" } });
    vi.mocked(getAuthState).mockResolvedValueOnce({ user: null, profile: null } as never);
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "not_signed_in" } });
    vi.mocked(getAuthState).mockResolvedValueOnce({
      user: { id: UID, email: "asha@example.com" }, profile: { handle: "asha", fullName: "Asha", avatarUrl: null, onboarded: false },
    } as never);
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "not_onboarded" } });

    // Another user's registration is invisible (RLS + the user_id filter): not found.
    const { queryCalls } = sessionDb({ data: null, error: null });
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "registration_not_found" } });
    expect(queryCalls).toContainEqual(["eq", "user_id", UID]);
    expect(queryCalls).toContainEqual(["eq", "id", RID]);

    sessionDb(pendingRow({ hold_expires_at: inMs(-1000) }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "hold_expired" } });
    sessionDb(pendingRow({ hold_expires_at: null }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "hold_expired" } });
    for (const status of ["confirmed", "waitlisted", "cancelled", "refund_needed"]) {
      sessionDb(pendingRow({ status }));
      expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "hold_expired" } });
    }
    expect(f).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("refuses an order once the session is unpublished or has started", async () => {
    const f = razorpay(() => orderJson());
    adminDb(attachOk());
    const ev = { title: "Seeing Machines", slug: "seeing-machines", status: "published", starts_at: inMs(864e5) };
    const cases: [Record<string, unknown>, string][] = [
      [{ event: { ...ev, status: "cancelled" } }, "event_not_found"],
      [{ event: { ...ev, status: "draft" } }, "event_not_found"],
      [{ event: null }, "event_not_found"],
      [{ event: { ...ev, starts_at: inMs(-1000) } }, "registration_closed"],
      [{ event: { ...ev, starts_at: inMs(-1000) }, razorpay_order_id: ORDER }, "registration_closed"],
    ];
    for (const [over, code] of cases) {
      sessionDb(pendingRow(over));
      expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code } });
    }
    expect(f).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("maps a Razorpay timeout during order creation to a network error", async () => {
    sessionDb(pendingRow());
    adminDb(attachOk());
    razorpay(() => {
      throw Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
    });
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "network" } });
  });

  it("refuses to create or hand out an order when less than 120 s remain on the hold", async () => {
    const f = razorpay(() => orderJson());
    adminDb(attachOk());
    sessionDb(pendingRow({ hold_expires_at: inMs(119_000) }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "hold_expired" } });
    sessionDb(pendingRow({ hold_expires_at: inMs(60_000), razorpay_order_id: ORDER }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "hold_expired" } });
    expect(f).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    sessionDb(pendingRow({ hold_expires_at: inMs(125_000) }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: true });
  });

  it("creates an order for the amount stored on the hold, attaches it via the service role with the session user id, and returns checkout data without secrets", async () => {
    const hold = future();
    const { rpcCalls } = sessionDb(pendingRow({ hold_expires_at: hold }));
    const rpc = adminDb(attachOk());
    const f = razorpay(() => orderJson());
    const res = await createPaymentOrder(RID);
    expect(res).toEqual({
      ok: true,
      checkout: {
        keyId: CFG.keyId, orderId: ORDER, amountPaise: 19900, currency: "INR", name: "st(AI)rway",
        description: "Seeing Machines", prefill: { name: "Asha", email: "asha@example.com" },
        notes: { source: "stairway", registration_id: RID }, holdExpiresAt: hold, registrationId: RID,
      },
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/orders");
    const body = JSON.parse(String(f.mock.calls[0][1].body));
    expect(body).toEqual({
      amount: 19900, currency: "INR", receipt: `stw-${RID}`.slice(0, 40),
      notes: { source: "stairway", registration_id: RID, event_id: EID },
    });
    expect(createAdminClient).toHaveBeenCalledWith(CFG.serviceRoleKey);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("attach_payment_order", {
      p_user_id: UID, p_registration_id: RID, p_order_id: ORDER, p_amount_paise: 19900,
    });
    // The session client never attaches (the RPC is service-role only).
    expect(rpcCalls).toEqual([]);
    const text = JSON.stringify(res);
    for (const s of SECRETS) expect(text).not.toContain(s);
  });

  it("reuses the hold's existing order (no new Razorpay order, no attach)", async () => {
    sessionDb(pendingRow({ razorpay_order_id: ORDER }));
    const f = razorpay(() => Response.json({}));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: true, checkout: { orderId: ORDER, amountPaise: 19900 } });
    expect(f).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("uses the order the database kept when two tabs raced", async () => {
    sessionDb(pendingRow());
    adminDb(attachOk("order_FIRSTTAB0001"));
    razorpay(() => orderJson());
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: true, checkout: { orderId: "order_FIRSTTAB0001" } });
  });

  it("refuses an order whose amount or currency is not the hold's, and a junk attach result", async () => {
    sessionDb(pendingRow());
    const rpc = adminDb(attachOk());
    razorpay(() => orderJson({ amount: 100 }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "unknown" } });
    razorpay(() => orderJson({ currency: "USD" }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "unknown" } });
    expect(rpc).not.toHaveBeenCalled();
    adminDb({ attach_payment_order: { data: { order_id: "nope" }, error: null } });
    razorpay(() => orderJson());
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "unknown" } });
    // A stored amount below Razorpay's minimum never reaches Razorpay.
    sessionDb(pendingRow({ amount_paise: 0 }));
    const f = razorpay(() => orderJson());
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "unknown" } });
    expect(f).not.toHaveBeenCalled();
  });

  it("maps Razorpay and attach failures to typed, non-leaky errors", async () => {
    sessionDb(pendingRow());
    adminDb(attachOk());
    razorpay(() => Response.json({ error: { code: "BAD_REQUEST_ERROR", description: "key_secret_value_123" } }, { status: 400 }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "checkout_unavailable" } });
    razorpay(() => {
      throw new TypeError("fetch failed");
    });
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "network" } });

    razorpay(() => orderJson());
    const cases: [string, string][] = [
      ["hold_expired", "hold_expired"],
      ["payments_disabled", "paid_event"],
      ["registration_not_found", "registration_not_found"],
      ["amount_mismatch", "unknown"],
      ["invalid_order", "unknown"],
    ];
    for (const [msg, code] of cases) {
      adminDb({ attach_payment_order: { data: null, error: { message: msg, code: "P0001" } } });
      const res = await createPaymentOrder(RID);
      expect(res).toMatchObject({ ok: false, error: { code } });
    }
    adminDb({ attach_payment_order: { data: null, error: { message: "relation private.payment_orders secret", code: "XX000" } } });
    const res = await createPaymentOrder(RID);
    expect(res).toMatchObject({ ok: false, error: { code: "unknown" } });
    expect(JSON.stringify(res)).not.toContain("private.payment_orders");
  });

  it("turns a thrown session error into a typed error", async () => {
    vi.mocked(createClient).mockRejectedValue(new Error("cookies exploded service_role_key_value_000000"));
    const res = await createPaymentOrder(RID);
    expect(res).toMatchObject({ ok: false, error: { code: "unknown" } });
    for (const s of SECRETS) expect(JSON.stringify(res)).not.toContain(s);
  });
});

describe("verifyPayment", () => {
  const good = () => ({ registrationId: RID, orderId: ORDER, paymentId: PAY, signature: sig() });
  const rzpOk = (payment: Record<string, unknown> = {}, order: Record<string, unknown> = {}) =>
    razorpay((url) =>
      url.includes("/payments/")
        ? Response.json({ id: PAY, order_id: ORDER, amount: 19900, currency: "INR", status: "captured", method: "upi", notes: {}, ...payment })
        : Response.json({ id: ORDER, amount: 19900, currency: "INR", status: "paid", notes: { source: "stairway", registration_id: RID }, ...order }));
  const own = (over: Record<string, unknown> = {}) =>
    sessionDb({ data: { id: RID, status: "pending_payment", razorpay_payment_id: null, event: { slug: "seeing-machines" }, ...over }, error: null });
  const confirmed = { confirm_payment: { data: { outcome: "confirmed", registration_id: RID, status: "confirmed" }, error: null } };

  it("rejects malformed input, extra keys and bad or replayed signatures before any service-role call", async () => {
    own();
    const f = rzpOk();
    const bad: unknown[] = [
      null, "x", 42, {},
      { ...good(), signature: "nope" },
      { ...good(), registrationId: "not-a-uuid" },
      { ...good(), orderId: "order_" },
      { ...good(), paymentId: "payment_123" },
      { ...good(), amountPaise: 1 },
      { ...good(), userId: UID },
      { ...good(), status: "confirmed" },
    ];
    for (const input of bad) {
      expect(await verifyPayment(input as never)).toMatchObject({ ok: false, error: { code: "payment_unverified" } });
    }
    // A valid signature for another payment (replayed onto this one) or signed with another key.
    expect(await verifyPayment({ ...good(), signature: sig(ORDER, "pay_OTHER0000001") }))
      .toMatchObject({ ok: false, error: { code: "payment_unverified" } });
    expect(await verifyPayment({ ...good(), signature: createHmac("sha256", "other").update(`${ORDER}|${PAY}`).digest("hex") }))
      .toMatchObject({ ok: false, error: { code: "payment_unverified" } });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    vi.mocked(getAuthState).mockResolvedValueOnce({ user: null, profile: null } as never);
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "not_signed_in" } });
  });

  it("only verifies the user's own registration (another user's id looks not found)", async () => {
    const { queryCalls } = sessionDb({ data: null, error: null });
    const f = rzpOk();
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "registration_not_found" } });
    expect(queryCalls).toContainEqual(["eq", "user_id", UID]);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it("confirms a verified, captured payment through the service-role RPC and refreshes the pages", async () => {
    own();
    rzpOk();
    const rpc = adminDb(confirmed);
    const res = await verifyPayment(good());
    expect(res).toEqual({ ok: true, status: "confirmed" });
    expect(createAdminClient).toHaveBeenCalledWith(CFG.serviceRoleKey);
    expect(rpc).toHaveBeenCalledWith("confirm_payment", expect.objectContaining({
      p_registration_id: RID, p_source: "client_verify", p_order_id: ORDER, p_payment_id: PAY, p_amount_paise: 19900, p_currency: "INR",
    }));
    expect(revalidatePath).toHaveBeenCalledWith("/events/seeing-machines");
    for (const s of SECRETS) expect(JSON.stringify(res)).not.toContain(s);
  });

  it("is idempotent: verifying the same payment twice returns the same confirmed result", async () => {
    own();
    rzpOk();
    adminDb(confirmed);
    expect(await verifyPayment(good())).toEqual({ ok: true, status: "confirmed" });
    // Second call: the row now carries the payment, so no Razorpay fetch and no admin call at all.
    vi.mocked(createAdminClient).mockClear();
    own({ status: "confirmed", razorpay_payment_id: PAY });
    const f = rzpOk();
    expect(await verifyPayment(good())).toEqual({ ok: true, status: "confirmed" });
    expect(f).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    // If the row was read before the first confirm landed, the database still answers already_processed.
    own();
    rzpOk();
    adminDb({ confirm_payment: { data: { outcome: "already_processed", registration_id: RID, status: "confirmed" }, error: null } });
    expect(await verifyPayment(good())).toEqual({ ok: true, status: "confirmed" });
  });

  it("answers a replay of an already-applied payment from the row: zero Razorpay fetches, zero service-role calls", async () => {
    const cases: [string, unknown][] = [
      ["confirmed", { ok: true, status: "confirmed" }],
      ["refund_needed", { ok: true, status: "refund_needed" }],
      ["refunded", { ok: true, status: "refund_needed" }],
    ];
    for (const [status, expected] of cases) {
      own({ status, razorpay_payment_id: PAY });
      const f = rzpOk();
      expect(await verifyPayment(good())).toEqual(expected);
      expect(f).not.toHaveBeenCalled();
      expect(createAdminClient).not.toHaveBeenCalled();
    }
    // A different payment on an already-paid seat still reaches the database (duplicate_payment is recorded).
    own({ status: "confirmed", razorpay_payment_id: "pay_EARLIER000001" });
    rzpOk();
    const rpc = adminDb({ confirm_payment: { data: { outcome: "duplicate_payment", registration_id: RID, status: "confirmed" }, error: null } });
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_review" } });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("maps a failed payment to payment_failed and a refunded one to unverified, without confirm_payment", async () => {
    own();
    rzpOk({ status: "failed" });
    let rpc = adminDb(confirmed);
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_failed" } });
    expect(rpc).not.toHaveBeenCalled();
    own();
    rzpOk({ status: "refunded" });
    rpc = adminDb(confirmed);
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_unverified" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats permanent Razorpay refusals as unverified and transient ones as processing", async () => {
    for (const status of [400, 401, 403, 404]) {
      own();
      razorpay(() => Response.json({ error: { code: "BAD_REQUEST_ERROR" } }, { status }));
      expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_unverified" } });
    }
    own();
    razorpay(() => Response.json({ unexpected: true }));
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_unverified" } });
    for (const status of [408, 429, 500, 502, 503]) {
      own();
      razorpay(() => new Response("oops", { status }));
      expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_processing" } });
    }
    own();
    razorpay(() => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_processing" } });
  });

  it("refuses a foreign order (Fund Easy or another registration) without calling confirm_payment", async () => {
    for (const notes of [{ source: "fundeasy", registration_id: RID }, { source: "stairway", registration_id: "44444444-4444-4444-8444-444444444444" }]) {
      own();
      rzpOk({}, { notes });
      const rpc = adminDb(confirmed);
      expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_unverified" } });
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("maps every outcome", async () => {
    const cases: [Record<string, unknown>, unknown][] = [
      [{ outcome: "late_confirmed", status: "confirmed" }, { ok: true, status: "confirmed" }],
      [{ outcome: "refund_needed", status: "refund_needed" }, { ok: true, status: "refund_needed" }],
      [{ outcome: "already_processed", status: "confirmed" }, { ok: true, status: "confirmed" }],
      [{ outcome: "already_processed", status: "refund_needed" }, { ok: true, status: "refund_needed" }],
      [{ outcome: "already_processed", status: "refunded" }, { ok: true, status: "refund_needed" }],
      [{ outcome: "already_processed", status: "pending_payment" }, { ok: true, status: "processing" }],
      [{ outcome: "duplicate_payment", status: "confirmed" }, { ok: false, error: { code: "payment_review" } }],
      [{ outcome: "amount_mismatch", status: "pending_payment" }, { ok: false, error: { code: "payment_review" } }],
      [{ outcome: "unknown_order" }, { ok: false, error: { code: "payment_unverified" } }],
    ];
    for (const [data, expected] of cases) {
      own();
      rzpOk();
      adminDb({ confirm_payment: { data: { registration_id: RID, ...data }, error: null } });
      expect(await verifyPayment(good())).toMatchObject(expected as object);
    }
  });

  it("treats permanent RPC refusals as unverified (no retry), not as processing", async () => {
    for (const msg of ["invalid_source", "invalid_payment", "invalid_event", "payment_conflict"]) {
      own();
      rzpOk();
      adminDb({ confirm_payment: { data: null, error: { message: msg, code: "P0001" } } });
      expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_unverified" } });
    }
  });

  it("reports 'processing' for an authorised-but-not-captured payment and a retryable error when Razorpay or the DB is unreachable", async () => {
    own();
    rzpOk({ status: "authorized" });
    const rpc = adminDb({});
    expect(await verifyPayment(good())).toEqual({ ok: true, status: "processing" });
    expect(rpc).not.toHaveBeenCalled();

    own();
    razorpay(() => {
      throw new TypeError("fetch failed");
    });
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_processing", recovery: "tickets" } });

    own();
    rzpOk();
    adminDb({ confirm_payment: { data: null, error: { message: "secret detail service_role_key_value_000000", code: "XX000" } } });
    const res = await verifyPayment(good());
    expect(res).toMatchObject({ ok: false, error: { code: "payment_processing" } });
    for (const s of SECRETS) expect(JSON.stringify(res)).not.toContain(s);
    expect(JSON.stringify(res)).not.toContain("secret detail");
  });

  it("says processing (never 'opens soon') when payments were switched off after the user paid", async () => {
    vi.mocked(paymentsConfig).mockReturnValue({ enabled: false });
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_processing", recovery: "tickets" } });
    expect(createClient).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
