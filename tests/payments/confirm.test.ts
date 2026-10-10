import { describe, expect, it, vi } from "vitest";
import { confirmVerifiedPayment } from "@/lib/payments/confirm";
import { RazorpayError, type FetchLike } from "@/lib/payments/razorpay";

const CREDS = { keyId: "rzp_test_ABCDEFGH1234", keySecret: "secret_value_000" };
const RID = "33333333-3333-4333-8333-333333333333";
const ORDER = "order_P4CONF000001";
const PAY = "pay_P4CONF000001";

function razorpay(payment: Record<string, unknown> = {}, order: Record<string, unknown> = {}) {
  return vi.fn<FetchLike>(async (url) =>
    url.includes("/payments/")
      ? Response.json({ id: PAY, order_id: ORDER, amount: 19900, currency: "INR", status: "captured", method: "upi", notes: {}, ...payment })
      : Response.json({ id: ORDER, amount: 19900, currency: "INR", status: "paid", notes: { source: "stairway", registration_id: RID }, ...order }));
}
function fakeDb(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) };
}
const input = { registrationId: RID, orderId: ORDER, paymentId: PAY, source: "client_verify" as const };
const ok = { data: { outcome: "confirmed", registration_id: RID, status: "confirmed" }, error: null };

describe("confirmVerifiedPayment", () => {
  it("re-fetches the payment and the order, then confirms with the captured amount and currency", async () => {
    const f = razorpay();
    const db = fakeDb(ok);
    expect(await confirmVerifiedPayment({ creds: CREDS, fetch: f, db: db as never }, input)).toEqual({ outcome: "confirmed", status: "confirmed" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls.map((c) => [c[0], c[1].method])).toEqual([
      [`https://api.razorpay.com/v1/payments/${PAY}`, "GET"],
      [`https://api.razorpay.com/v1/orders/${ORDER}`, "GET"],
    ]);
    expect(db.rpc).toHaveBeenCalledWith("confirm_payment", {
      p_registration_id: RID, p_order_id: ORDER, p_payment_id: PAY, p_amount_paise: 19900, p_currency: "INR",
      p_source: "client_verify", p_event_id: undefined, p_event_name: undefined, p_details: { status: "captured", method: "upi" },
    });
  });

  it("trusts order notes from a signed webhook body instead of fetching the order", async () => {
    const f = razorpay();
    const db = fakeDb(ok);
    await confirmVerifiedPayment({ creds: CREDS, fetch: f, db: db as never }, {
      ...input, source: "webhook", eventId: "evt_1", eventName: "order.paid", orderNotes: { source: "stairway", registration_id: RID },
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("confirm_payment", expect.objectContaining({ p_source: "webhook", p_event_id: "evt_1", p_event_name: "order.paid" }));
  });

  it("treats another order's payment, Fund Easy notes or another registration as foreign, without touching the DB", async () => {
    for (const f of [
      razorpay({ order_id: "order_OTHER0000001" }),
      razorpay({ order_id: null }),
      razorpay({}, { notes: { source: "fundeasy", registration_id: RID } }),
      razorpay({}, { notes: { source: "stairway", registration_id: "44444444-4444-4444-8444-444444444444" } }),
      razorpay({}, { notes: [] }),
      razorpay({}, { id: "order_OTHER0000001" }),
    ]) {
      const db = fakeDb(ok);
      expect((await confirmVerifiedPayment({ creds: CREDS, fetch: f, db: db as never }, input)).outcome).toBe("foreign");
      expect(db.rpc).not.toHaveBeenCalled();
    }
  });

  it("does not confirm a payment that is not captured yet", async () => {
    for (const status of ["authorized", "created", "failed", "refunded"]) {
      const db = fakeDb(ok);
      const res = await confirmVerifiedPayment({ creds: CREDS, fetch: razorpay({ status }), db: db as never }, input);
      expect(res).toEqual({ outcome: "not_captured", status: null });
      expect(db.rpc).not.toHaveBeenCalled();
    }
  });

  it("passes Razorpay's captured amount and currency so the database refuses a mismatch", async () => {
    const db = fakeDb({ data: { outcome: "amount_mismatch", registration_id: RID, status: "pending_payment" }, error: null });
    const res = await confirmVerifiedPayment({ creds: CREDS, fetch: razorpay({ amount: 100, currency: "USD" }), db: db as never }, input);
    expect(res).toEqual({ outcome: "amount_mismatch", status: "pending_payment" });
    expect(db.rpc).toHaveBeenCalledWith("confirm_payment", expect.objectContaining({ p_amount_paise: 100, p_currency: "USD" }));
  });

  it("maps unknown_order (no status) and a replay (already_processed)", async () => {
    let db = fakeDb({ data: { outcome: "unknown_order" }, error: null });
    expect(await confirmVerifiedPayment({ creds: CREDS, fetch: razorpay(), db: db as never }, input)).toEqual({ outcome: "unknown_order", status: null });
    db = fakeDb({ data: { outcome: "already_processed", registration_id: RID, status: "confirmed" }, error: null });
    expect(await confirmVerifiedPayment({ creds: CREDS, fetch: razorpay(), db: db as never }, input)).toEqual({ outcome: "already_processed", status: "confirmed" });
  });

  it("reports the permanent RPC refusals as 'rejected' instead of throwing (no retry would ever succeed)", async () => {
    for (const msg of ["invalid_source", "invalid_payment", "invalid_event", "payment_conflict"]) {
      const db = fakeDb({ data: null, error: { message: msg, code: "P0001" } });
      expect(await confirmVerifiedPayment({ creds: CREDS, fetch: razorpay(), db: db as never }, input)).toEqual({ outcome: "rejected", status: null });
    }
  });

  it("throws a message without database text when the RPC fails or returns junk", async () => {
    const failing = fakeDb({ data: null, error: { message: "secret table detail", code: "XX000" } });
    const err = await confirmVerifiedPayment({ creds: CREDS, fetch: razorpay(), db: failing as never }, input).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).not.toContain("secret table detail");
    // A P0001 that is not a known permanent refusal is still a failure (retryable), with no DB text.
    const other = fakeDb({ data: null, error: { message: "hold_expired: row 42 in private.x", code: "P0001" } });
    const err2 = await confirmVerifiedPayment({ creds: CREDS, fetch: razorpay(), db: other as never }, input).catch((e) => e);
    expect(String(err2.message)).not.toContain("private.x");
    await expect(confirmVerifiedPayment({ creds: CREDS, fetch: razorpay(), db: fakeDb({ data: { nope: 1 }, error: null }) as never }, input))
      .rejects.toThrow();
  });

  it("lets Razorpay failures surface as RazorpayError (retryable), never touching the DB", async () => {
    const db = fakeDb(ok);
    const f = vi.fn<FetchLike>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(confirmVerifiedPayment({ creds: CREDS, fetch: f, db: db as never }, input)).rejects.toBeInstanceOf(RazorpayError);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
