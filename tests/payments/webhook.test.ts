import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRazorpayWebhook, MAX_WEBHOOK_BYTES, type WebhookDeps } from "@/lib/payments/webhook";
import type { FetchLike } from "@/lib/payments/razorpay";

const SECRET = "webhook_secret_value";
const RID = "33333333-3333-4333-8333-333333333333";
const ORDER = "order_P4HOOK000001";
const PAY = "pay_P4HOOK000001";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");

const orderPaid = (notes: unknown = { source: "stairway", registration_id: RID }, paymentOrder = ORDER) =>
  JSON.stringify({
    entity: "event", event: "order.paid", contains: ["payment", "order"],
    payload: {
      payment: { entity: { id: PAY, order_id: paymentOrder, amount: 19900, currency: "INR", status: "captured", email: "x@y.z", contact: "+91" } },
      order: { entity: { id: ORDER, amount: 19900, amount_paid: 19900, currency: "INR", status: "paid", notes } },
    },
  });
const refundProcessed = (notes: unknown = { source: "stairway", registration_id: RID }, amount: unknown = 19900) =>
  JSON.stringify({
    entity: "event", event: "refund.processed",
    payload: { refund: { entity: { id: "rfnd_P4HOOK000001", payment_id: PAY, amount, status: "processed", notes } } },
  });

function deps(rpcResult: { data: unknown; error: unknown } = { data: { outcome: "confirmed", status: "confirmed" }, error: null }, payment: Record<string, unknown> = {}) {
  const rpc = vi.fn(async () => rpcResult);
  const db = vi.fn(() => ({ rpc }) as never);
  const fetch = vi.fn<FetchLike>(async () =>
    Response.json({ id: PAY, order_id: ORDER, amount: 19900, currency: "INR", status: "captured", method: "upi", notes: {}, ...payment }));
  const d: WebhookDeps = { webhookSecret: SECRET, creds: { keyId: "rzp_test_ABCDEFGH1234", keySecret: "k_secret_000000" }, fetch, db };
  return { d, rpc, db, fetch };
}
const req = (rawBody: string, signature: string | null = sign(rawBody), eventId: string | null = "evt_P4HOOK000001") =>
  ({ rawBody, signature, eventId });

afterEach(() => vi.restoreAllMocks());

describe("handleRazorpayWebhook", () => {
  it("rejects oversize bodies and bad signatures before parsing or touching the DB", async () => {
    const { d, db, fetch } = deps();
    expect((await handleRazorpayWebhook(d, req("x".repeat(MAX_WEBHOOK_BYTES + 1)))).status).toBe(413);
    expect((await handleRazorpayWebhook(d, req(orderPaid(), "0".repeat(64)))).status).toBe(401);
    expect((await handleRazorpayWebhook(d, req(orderPaid(), null))).status).toBe(401);
    expect((await handleRazorpayWebhook(d, req(orderPaid(), sign(orderPaid()).toUpperCase()))).status).toBe(401);
    // A signature over a re-serialised body does not verify the raw body.
    expect((await handleRazorpayWebhook(d, req(` ${orderPaid()}`, sign(orderPaid())))).status).toBe(401);
    expect(db).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never verifies with an empty secret", async () => {
    const { d, db } = deps();
    const body = orderPaid();
    const emptySig = createHmac("sha256", "").update(body).digest("hex");
    expect((await handleRazorpayWebhook({ ...d, webhookSecret: "" }, req(body, emptySig))).status).toBe(401);
    expect(db).not.toHaveBeenCalled();
  });
  it("confirms an order.paid for our order using the signed order notes and the event id", async () => {
    const { d, rpc, fetch, db } = deps();
    const res = await handleRazorpayWebhook(d, req(orderPaid()));
    expect(res).toEqual({ status: 200, body: { ok: true, result: "confirmed" } });
    expect(fetch).toHaveBeenCalledTimes(1); // the payment is re-fetched; the order notes come from the signed body
    expect(db).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("confirm_payment", expect.objectContaining({
      p_registration_id: RID, p_order_id: ORDER, p_payment_id: PAY, p_source: "webhook",
      p_event_id: "evt_P4HOOK000001", p_event_name: "order.paid",
    }));
  });
  it("acknowledges and ignores Fund Easy's orders, other events and malformed payloads without a DB call", async () => {
    for (const body of [
      orderPaid({ source: "fundeasy", campaign: "x" }),
      orderPaid([]),
      orderPaid({ source: "stairway", registration_id: "not-a-uuid" }),
      orderPaid(undefined, "order_OTHER000001"),
      JSON.stringify({ event: "payment.captured", payload: {} }),
      JSON.stringify({ event: "order.paid", payload: { order: {} } }),
      JSON.stringify("just a string"),
      JSON.stringify(null),
      refundProcessed({ source: "fundeasy" }),
      refundProcessed({ source: "fundeasy", refund_id: "x" }),
      refundProcessed([]),
      refundProcessed(undefined, 0),
      refundProcessed(undefined, -5),
      refundProcessed(undefined, 1.5),
      refundProcessed(undefined, 2 ** 31),
    ]) {
      const { d, db, fetch } = deps();
      const res = await handleRazorpayWebhook(d, req(body));
      expect(res.status, body).toBe(200);
      expect(res.body.result, body).toMatch(/^ignored:/);
      expect(db).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  });
  it("answers 400 for a signed body that is not JSON", async () => {
    const { d, db } = deps();
    expect((await handleRazorpayWebhook(d, req("not json"))).status).toBe(400);
    expect(db).not.toHaveBeenCalled();
  });
  it("asks Razorpay to retry while the payment is not captured", async () => {
    const { d, rpc } = deps(undefined, { status: "authorized" });
    expect((await handleRazorpayWebhook(d, req(orderPaid()))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("answers 200 for Razorpay's final payment states and permanent database refusals (no retry storm)", async () => {
    for (const status of ["failed", "refunded"]) {
      const { d, rpc } = deps(undefined, { status });
      const res = await handleRazorpayWebhook(d, req(orderPaid()));
      expect(res).toEqual({ status: 200, body: { ok: true, result: status === "failed" ? "payment_failed" : "payment_refunded" } });
      expect(rpc).not.toHaveBeenCalled();
    }
    const { d } = deps({ data: null, error: { code: "P0001", message: "payment_conflict" } });
    expect(await handleRazorpayWebhook(d, req(orderPaid()))).toEqual({ status: 200, body: { ok: true, result: "rejected" } });
  });
  it("passes duplicate deliveries to the database, which answers duplicate_event", async () => {
    const { d } = deps({ data: { outcome: "duplicate_event", status: "confirmed" }, error: null });
    expect(await handleRazorpayWebhook(d, req(orderPaid()))).toEqual({ status: 200, body: { ok: true, result: "duplicate_event" } });
  });
  it("answers 200 for outcomes that land on the attention list", async () => {
    for (const outcome of ["amount_mismatch", "duplicate_payment", "refund_needed", "already_processed"]) {
      const { d } = deps({ data: { outcome, status: "confirmed" }, error: null });
      expect(await handleRazorpayWebhook(d, req(orderPaid()))).toEqual({ status: 200, body: { ok: true, result: outcome } });
    }
  });
  it("logs a non-secret marker when money was captured for our notes but the database knows no such order", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { d } = deps({ data: { outcome: "unknown_order" }, error: null });
    expect(await handleRazorpayWebhook(d, req(orderPaid()))).toEqual({ status: 200, body: { ok: true, result: "unknown_order" } });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].join(" ");
    expect(line).toContain("evt_P4HOOK000001");
    expect(line).toContain("unknown_order");
    for (const s of [RID, ORDER, PAY, SECRET, "x@y.z"]) expect(line).not.toContain(s);
  });
  it("does not log routine outcomes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { d } = deps();
    await handleRazorpayWebhook(d, req(orderPaid()));
    expect(warn).not.toHaveBeenCalled();
  });
  it("drops a malformed event id instead of storing it", async () => {
    const { d, rpc } = deps();
    await handleRazorpayWebhook(d, req(orderPaid(), undefined, "evt with spaces"));
    expect(rpc).toHaveBeenCalledWith("confirm_payment", expect.objectContaining({ p_event_id: undefined }));
  });
  it("records refund.processed for our refunds", async () => {
    const { d, rpc, fetch } = deps({ data: { outcome: "refunded", status: "refunded" }, error: null });
    const res = await handleRazorpayWebhook(d, req(refundProcessed()));
    expect(res).toEqual({ status: 200, body: { ok: true, result: "refunded" } });
    expect(fetch).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mark_refunded", {
      p_registration_id: RID, p_payment_id: PAY, p_refund_id: "rfnd_P4HOOK000001", p_amount_paise: 19900,
      p_source: "webhook", p_event_id: "evt_P4HOOK000001",
    });
  });
  it("answers 200 for partial and repeated refunds (the database records them idempotently)", async () => {
    for (const outcome of ["partial_refund", "already_refunded", "ledger_refund", "duplicate_event"]) {
      const { d } = deps({ data: { outcome, status: "confirmed" }, error: null });
      expect(await handleRazorpayWebhook(d, req(refundProcessed(undefined, 5000)))).toEqual({ status: 200, body: { ok: true, result: outcome } });
    }
  });
  it("logs a marker for a refund of ours that the database cannot place", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const outcome of ["unknown_registration", "unknown_payment"]) {
      const { d } = deps({ data: { outcome }, error: null });
      expect((await handleRazorpayWebhook(d, req(refundProcessed()))).body.result).toBe(outcome);
    }
    expect(warn).toHaveBeenCalledTimes(2);
    for (const call of warn.mock.calls) for (const s of [RID, PAY, "rfnd_P4HOOK000001"]) expect(call.join(" ")).not.toContain(s);
  });
  it("answers 200 rejected when mark_refunded refuses its input permanently", async () => {
    const { d } = deps({ data: null, error: { code: "P0001", message: "invalid_refund" } });
    expect(await handleRazorpayWebhook(d, req(refundProcessed()))).toEqual({ status: 200, body: { ok: true, result: "rejected" } });
  });
  it("throws (so the route answers 500 and Razorpay retries) when the database fails", async () => {
    const { d } = deps({ data: null, error: { message: "boom secret detail", code: "XX000" } });
    await expect(handleRazorpayWebhook(d, req(refundProcessed()))).rejects.toThrow(/XX000/);
    await expect(handleRazorpayWebhook(d, req(refundProcessed()))).rejects.not.toThrow(/boom/);
    const c = deps({ data: null, error: { message: "boom", code: "40001" } });
    await expect(handleRazorpayWebhook(c.d, req(orderPaid()))).rejects.toThrow();
  });
  it("throws on an unexpected mark_refunded result shape", async () => {
    const { d } = deps({ data: { nope: 1 }, error: null });
    await expect(handleRazorpayWebhook(d, req(refundProcessed()))).rejects.toThrow();
  });
  it("retries transient Razorpay failures but acknowledges permanent ones with a marker", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const status of [500, 502, 429, 401]) {
      const { d, rpc } = deps();
      vi.mocked(d.fetch).mockResolvedValue(Response.json({ error: { code: "SERVER_ERROR" } }, { status }));
      await expect(handleRazorpayWebhook(d, req(orderPaid()))).rejects.toThrow();
      expect(rpc).not.toHaveBeenCalled();
    }
    const net = deps();
    vi.mocked(net.d.fetch).mockRejectedValue(new TypeError("fetch failed"));
    await expect(handleRazorpayWebhook(net.d, req(orderPaid()))).rejects.toThrow();

    const { d, rpc } = deps();
    vi.mocked(d.fetch).mockResolvedValue(Response.json({ error: { code: "BAD_REQUEST_ERROR" } }, { status: 400 }));
    expect(await handleRazorpayWebhook(d, req(orderPaid()))).toEqual({ status: 200, body: { ok: true, result: "razorpay_rejected" } });
    expect(rpc).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0].join(" ")).toContain("BAD_REQUEST_ERROR");
  });
});
