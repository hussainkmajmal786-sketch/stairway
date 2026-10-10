import { describe, expect, it, vi } from "vitest";
import {
  createOrder, fetchOrder, fetchPayment, fetchRefunds, RAZORPAY_API, RazorpayError, refundPayment, type FetchLike,
} from "@/lib/payments/razorpay";

const CREDS = { keyId: "rzp_test_ABCDEFGH1234", keySecret: "s3cr3t_value_xyz" };

function fakeFetch(status: number, body: unknown) {
  const f = vi.fn<FetchLike>(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  return f;
}
const init = (f: ReturnType<typeof fakeFetch>, i = 0) => f.mock.calls[i][1];
const url = (f: ReturnType<typeof fakeFetch>, i = 0) => f.mock.calls[i][0];

const ORDER = { id: "order_P4TEST000001", amount: 19900, currency: "INR", status: "created", notes: { source: "stairway", registration_id: "r1" } };
const PAYMENT = { id: "pay_P4TEST000001", order_id: "order_P4TEST000001", amount: 19900, currency: "INR", status: "captured", method: "upi", notes: [] };
const REFUND = { id: "rfnd_P4TEST000001", payment_id: PAYMENT.id, amount: 19900, status: "processed", notes: {} };

describe("createOrder", () => {
  it("POSTs amount, INR, receipt and notes with Basic auth", async () => {
    const f = fakeFetch(200, ORDER);
    const o = await createOrder(CREDS, f, { amountPaise: 19900, receipt: "stw-r1", notes: { source: "stairway", registration_id: "r1" } });
    expect(o).toEqual(ORDER);
    expect(url(f)).toBe(`${RAZORPAY_API}/orders`);
    expect(init(f).method).toBe("POST");
    expect((init(f).headers as Record<string, string>).authorization)
      .toBe(`Basic ${Buffer.from(`${CREDS.keyId}:${CREDS.keySecret}`).toString("base64")}`);
    expect(JSON.parse(String(init(f).body))).toEqual({
      amount: 19900, currency: "INR", receipt: "stw-r1", notes: { source: "stairway", registration_id: "r1" },
    });
    expect(init(f).signal).toBeInstanceOf(AbortSignal);
  });
  it("refuses amounts Razorpay would reject without calling it", async () => {
    const f = fakeFetch(200, ORDER);
    await expect(createOrder(CREDS, f, { amountPaise: 99, receipt: "x", notes: {} })).rejects.toMatchObject({ code: "BAD_AMOUNT" });
    await expect(createOrder(CREDS, f, { amountPaise: 1.5, receipt: "x", notes: {} })).rejects.toMatchObject({ code: "BAD_AMOUNT" });
    expect(f).not.toHaveBeenCalled();
  });
  it("truncates the receipt to Razorpay's 40 characters", async () => {
    const f = fakeFetch(200, ORDER);
    await createOrder(CREDS, f, { amountPaise: 19900, receipt: "x".repeat(60), notes: {} });
    expect(JSON.parse(String(init(f).body)).receipt).toHaveLength(40);
  });
});

describe("errors", () => {
  it("carries Razorpay's error code and status, never the body or the secret", async () => {
    const f = fakeFetch(400, { error: { code: "BAD_REQUEST_ERROR", description: `bad key ${CREDS.keySecret}` } });
    const err = await createOrder(CREDS, f, { amountPaise: 19900, receipt: "x", notes: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(RazorpayError);
    expect(err).toMatchObject({ status: 400, code: "BAD_REQUEST_ERROR" });
    expect(String(err.message)).not.toContain(CREDS.keySecret);
    expect(String(err.message)).not.toContain("bad key");
    expect(JSON.stringify(err)).not.toContain(CREDS.keySecret);
  });
  it("does not echo an attacker-shaped error code", async () => {
    const f = fakeFetch(401, { error: { code: `oops ${CREDS.keySecret} <script>` } });
    const err = await fetchPayment(CREDS, f, PAYMENT.id).catch((e) => e);
    expect(err).toMatchObject({ status: 401, code: "HTTP_401" });
  });
  it("maps network failures, timeouts and malformed responses", async () => {
    const boom = vi.fn<FetchLike>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchPayment(CREDS, boom, PAYMENT.id)).rejects.toMatchObject({ code: "NETWORK" });
    const slow = vi.fn<FetchLike>(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    await expect(fetchPayment(CREDS, slow, PAYMENT.id)).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(fetchPayment(CREDS, fakeFetch(200, "not json"), PAYMENT.id)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    await expect(fetchPayment(CREDS, fakeFetch(200, { id: "nope" }), PAYMENT.id)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    await expect(fetchPayment(CREDS, fakeFetch(502, ""), PAYMENT.id)).rejects.toMatchObject({ status: 502, code: "HTTP_502" });
  });
  it("never puts a malformed id into a URL", async () => {
    const f = fakeFetch(200, PAYMENT);
    await expect(fetchPayment(CREDS, f, "pay_../../orders")).rejects.toMatchObject({ code: "BAD_ID" });
    await expect(fetchOrder(CREDS, f, "order_x?y=1")).rejects.toMatchObject({ code: "BAD_ID" });
    await expect(refundPayment(CREDS, f, "nope", { amountPaise: 100, notes: {} })).rejects.toMatchObject({ code: "BAD_ID" });
    await expect(fetchRefunds(CREDS, f, "pay_x/../y")).rejects.toMatchObject({ code: "BAD_ID" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("fetch and refund", () => {
  it("GETs a payment and normalises empty notes ([] in Razorpay's API) to {}", async () => {
    const f = fakeFetch(200, PAYMENT);
    const p = await fetchPayment(CREDS, f, PAYMENT.id);
    expect(url(f)).toBe(`${RAZORPAY_API}/payments/${PAYMENT.id}`);
    expect(init(f).method).toBe("GET");
    expect(init(f).body).toBeUndefined();
    expect(p).toMatchObject({ id: PAYMENT.id, order_id: ORDER.id, status: "captured", currency: "INR", notes: {} });
  });
  it("GETs an order with string notes", async () => {
    const f = fakeFetch(200, { ...ORDER, notes: { source: "stairway", registration_id: "r1", n: 5 } });
    const o = await fetchOrder(CREDS, f, ORDER.id);
    expect(o.notes).toEqual({ source: "stairway", registration_id: "r1", n: "5" });
  });
  it("POSTs a full refund with notes", async () => {
    const f = fakeFetch(200, REFUND);
    const r = await refundPayment(CREDS, f, PAYMENT.id, { amountPaise: 19900, notes: { source: "stairway", registration_id: "r1" } });
    expect(url(f)).toBe(`${RAZORPAY_API}/payments/${PAYMENT.id}/refund`);
    expect(JSON.parse(String(init(f).body))).toEqual({
      amount: 19900, speed: "normal", notes: { source: "stairway", registration_id: "r1" },
    });
    expect(r.id).toBe("rfnd_P4TEST000001");
  });
  it("refuses a refund amount that is not a positive integer without calling Razorpay", async () => {
    const f = fakeFetch(200, REFUND);
    await expect(refundPayment(CREDS, f, PAYMENT.id, { amountPaise: 0, notes: {} })).rejects.toMatchObject({ code: "BAD_AMOUNT" });
    await expect(refundPayment(CREDS, f, PAYMENT.id, { amountPaise: 10.5, notes: {} })).rejects.toMatchObject({ code: "BAD_AMOUNT" });
    expect(f).not.toHaveBeenCalled();
  });
  it("lists a payment's refunds (so a retried refund can find an earlier one instead of refunding twice)", async () => {
    const f = fakeFetch(200, { entity: "collection", count: 1, items: [REFUND] });
    const list = await fetchRefunds(CREDS, f, PAYMENT.id);
    expect(url(f)).toBe(`${RAZORPAY_API}/payments/${PAYMENT.id}/refunds`);
    expect(init(f).method).toBe("GET");
    expect(list).toEqual([REFUND]);
    await expect(fetchRefunds(CREDS, fakeFetch(200, { items: [{ id: "x" }] }), PAYMENT.id)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});
