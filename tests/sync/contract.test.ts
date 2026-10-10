import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildEnvelope, buildSyncRequest, classifyResponse, CONTRACT_VERSION, IDEMPOTENCY_HEADER, signBody,
  SIGNATURE_HEADER, TIMESTAMP_HEADER, type OutboxRow,
} from "@/lib/sync/contract";

const SECRET = "s".repeat(32);
const ROW: OutboxRow = {
  id: "55555555-5555-4555-8555-555555555555",
  event_type: "registration.confirmed",
  idempotency_key: "33333333-3333-4333-8333-333333333333:registration.confirmed:1760000000000000",
  payload: { registration: { id: "33333333-3333-4333-8333-333333333333", status: "confirmed" }, event: { slug: "seeing-machines" } },
  attempts: 1,
  created_at: "2026-10-10T10:00:00+00:00",
};

describe("envelope", () => {
  it("wraps the outbox payload in contract v1", () => {
    expect(CONTRACT_VERSION).toBe(1);
    expect(buildEnvelope(ROW)).toEqual({
      contract_version: 1, id: ROW.id, idempotency_key: ROW.idempotency_key, type: "registration.confirmed",
      occurred_at: ROW.created_at, source: "stairway", data: ROW.payload,
    });
  });
});

describe("signing", () => {
  it("signs `${timestamp}.${body}` with HMAC-SHA256 as v1=<hex>", async () => {
    const body = JSON.stringify(buildEnvelope(ROW));
    const expected = `v1=${createHmac("sha256", SECRET).update(`1760000000.${body}`).digest("hex")}`;
    expect(await signBody(SECRET, 1760000000, body)).toBe(expected);
  });
  it("builds a POST with the exact signed body and headers", async () => {
    const env = buildEnvelope(ROW);
    const init = await buildSyncRequest(SECRET, env, 1760000000500);
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe("POST");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers[TIMESTAMP_HEADER]).toBe("1760000000");
    expect(headers[IDEMPOTENCY_HEADER]).toBe(ROW.idempotency_key);
    expect(headers[SIGNATURE_HEADER]).toBe(await signBody(SECRET, 1760000000, String(init.body)));
    expect(JSON.parse(String(init.body))).toEqual(env);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.redirect).toBe("manual");
  });
});

describe("classifyResponse", () => {
  it("treats 2xx as delivered", () => {
    for (const s of [200, 201, 202, 204]) expect(classifyResponse(s, "")).toEqual({ ok: true });
  });
  it("retries timeouts, rate limits, server errors and auth failures (fixable configuration)", () => {
    for (const s of [401, 403, 408, 425, 429, 500, 502, 503, 504]) {
      expect(classifyResponse(s, "")).toMatchObject({ ok: false, permanent: false });
    }
  });
  it("dead-letters other client errors", () => {
    for (const s of [400, 404, 409, 410, 413, 422]) expect(classifyResponse(s, "")).toMatchObject({ ok: false, permanent: true });
  });
  it("keeps only the status and a short error code from the body", () => {
    expect(classifyResponse(422, '{"error":"conflict_existing_order","detail":"asha@example.com"}'))
      .toEqual({ ok: false, permanent: true, error: "HTTP 422 conflict_existing_order" });
    expect(classifyResponse(500, "<html>stack trace with secrets</html>")).toEqual({ ok: false, permanent: false, error: "HTTP 500" });
    expect(classifyResponse(400, `{"error":"${"x".repeat(200)}"}`).ok).toBe(false);
    expect((classifyResponse(400, `{"error":"${"x".repeat(200)}"}`) as { error: string }).error.length).toBeLessThanOrEqual(80);
  });
});
