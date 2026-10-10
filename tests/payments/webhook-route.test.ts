import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/payments/config", () => ({ paymentsConfig: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { paymentsConfig } from "@/lib/payments/config";
import * as route from "@/app/api/payments/webhook/route";
import { MAX_WEBHOOK_BYTES } from "@/lib/payments/webhook";

const CFG = {
  enabled: true, keyId: "rzp_test_ABCDEFGH1234", keySecret: "key_secret_value_123",
  webhookSecret: "webhook_secret_value", serviceRoleKey: "service_role_key_value_000000",
} as const;
const SECRETS = [CFG.keySecret, CFG.webhookSecret, CFG.serviceRoleKey];
const URL_ = "https://stairway.example/api/payments/webhook";
const sign = (body: string) => createHmac("sha256", CFG.webhookSecret).update(body).digest("hex");
const foreign = JSON.stringify({ event: "order.paid", payload: { order: { entity: { id: "order_FE0000000001", notes: { source: "fundeasy" } } }, payment: { entity: { id: "pay_FE0000000001", order_id: "order_FE0000000001" } } } });
const refund = JSON.stringify({
  event: "refund.processed",
  payload: { refund: { entity: { id: "rfnd_P4ROUTE00001", payment_id: "pay_P4ROUTE00001", amount: 19900, notes: { source: "stairway", registration_id: "33333333-3333-4333-8333-333333333333" } } } },
});

function post(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(URL_, { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

let logs: string[];
beforeEach(() => {
  vi.mocked(paymentsConfig).mockReturnValue(CFG);
  vi.mocked(createAdminClient).mockReset();
  logs = [];
  for (const m of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
  }
});
afterEach(() => {
  for (const line of logs) for (const s of SECRETS) expect(line).not.toContain(s);
  vi.restoreAllMocks();
});

describe("POST /api/payments/webhook", () => {
  it("exports POST only (other methods get 405; no CORS handlers)", () => {
    expect(Object.keys(route).filter((k) => /^[A-Z]+$/.test(k))).toEqual(["POST"]);
  });
  it("answers 404 while payments are off, without reading the body", async () => {
    vi.mocked(paymentsConfig).mockReturnValue({ enabled: false });
    const r = post(foreign, { "x-razorpay-signature": sign(foreign) });
    const res = await route.POST(r);
    expect(res.status).toBe(404);
    expect(r.bodyUsed).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("answers 413 from the declared length without reading the body", async () => {
    const r = post("{}", { "content-length": String(MAX_WEBHOOK_BYTES + 1) });
    const res = await route.POST(r);
    expect(res.status).toBe(413);
    expect(r.bodyUsed).toBe(false);
  });
  it("stops reading a streamed body once it passes the cap", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(16 * 1024).fill(0x61);
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 100) c.close();
        else c.enqueue(chunk);
      },
    });
    const res = await route.POST(post(stream));
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });
  it("answers 401 for a bad signature and never builds a service-role client", async () => {
    const res = await route.POST(post(foreign, { "x-razorpay-signature": "0".repeat(64) }));
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("acknowledges a foreign (Fund Easy) order with 200 and no service-role client", async () => {
    const res = await route.POST(post(foreign, { "x-razorpay-signature": sign(foreign), "x-razorpay-event-id": "evt_FE00001" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "ignored:not_ours" });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("records our refund with one RPC through the service-role client", async () => {
    const rpc = vi.fn(async () => ({ data: { outcome: "refunded", status: "refunded" }, error: null }));
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
    const res = await route.POST(post(refund, { "x-razorpay-signature": sign(refund), "x-razorpay-event-id": "evt_P4ROUTE0001" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "refunded" });
    expect(createAdminClient).toHaveBeenCalledWith(CFG.serviceRoleKey);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("answers 500 on a database failure and logs only the event id and a short code", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "XX000", message: "relation private.x secret detail" } }));
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
    const res = await route.POST(post(refund, { "x-razorpay-signature": sign(refund), "x-razorpay-event-id": "evt_P4ROUTE0002" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, result: "retry" });
    const line = logs.join("\n");
    expect(line).toContain("evt_P4ROUTE0002");
    expect(line).toContain("XX000");
    for (const s of ["secret detail", "pay_P4ROUTE00001", "rfnd_P4ROUTE00001", "33333333-3333"]) expect(line).not.toContain(s);
  });
});
