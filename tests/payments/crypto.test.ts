import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, timingSafeEqualHex, verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/payments/crypto";

const SECRET = "test_secret_0123456789";
const ref = (msg: string, secret = SECRET) => createHmac("sha256", secret).update(msg, "utf8").digest("hex");

describe("hmacSha256Hex", () => {
  it("matches Node's HMAC-SHA256 (ASCII and UTF-8)", async () => {
    expect(await hmacSha256Hex(SECRET, "hello")).toBe(ref("hello"));
    expect(await hmacSha256Hex(SECRET, "₹199 · st(AI)rway")).toBe(ref("₹199 · st(AI)rway"));
    expect(await hmacSha256Hex(SECRET, "")).toBe(ref(""));
  });
});

describe("timingSafeEqualHex", () => {
  it("compares equal strings only", () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
    expect(timingSafeEqualHex("abcd", "abc")).toBe(false);
    expect(timingSafeEqualHex("", "")).toBe(true);
  });
});

describe("verifyCheckoutSignature", () => {
  const order = "order_IluGWxBm9U8zJ8";
  const payment = "pay_IluGWxBm9U8zJ9";
  it("accepts HMAC(order_id|payment_id) with the key secret", async () => {
    expect(await verifyCheckoutSignature(SECRET, order, payment, ref(`${order}|${payment}`))).toBe(true);
  });
  it("rejects a signature for other ids, another secret, upper case or junk", async () => {
    expect(await verifyCheckoutSignature(SECRET, order, payment, ref(`${payment}|${order}`))).toBe(false);
    expect(await verifyCheckoutSignature(SECRET, order, payment, ref(`${order}|${payment}`, "other_secret_000000"))).toBe(false);
    expect(await verifyCheckoutSignature(SECRET, order, payment, ref(`${order}|${payment}`).toUpperCase())).toBe(false);
    expect(await verifyCheckoutSignature(SECRET, order, payment, "")).toBe(false);
    expect(await verifyCheckoutSignature(SECRET, order, payment, "zz".repeat(32))).toBe(false);
  });
  it("rejects when the secret is empty (never signs with an empty key)", async () => {
    expect(await verifyCheckoutSignature("", order, payment, ref(`${order}|${payment}`, ""))).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  const body = '{"event":"order.paid","payload":{}}';
  it("accepts HMAC(raw body) with the webhook secret", async () => {
    expect(await verifyWebhookSignature(SECRET, body, ref(body))).toBe(true);
  });
  it("rejects a re-serialised body, a missing header and another secret", async () => {
    expect(await verifyWebhookSignature(SECRET, JSON.stringify(JSON.parse(body), null, 1), ref(body))).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, null)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, ref(body, "other_secret_000000"))).toBe(false);
    expect(await verifyWebhookSignature("", body, ref(body, ""))).toBe(false);
  });
});
