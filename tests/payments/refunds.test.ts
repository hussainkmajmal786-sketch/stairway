import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/payments/config", () => ({ paymentsConfig: vi.fn(() => ({ enabled: false })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { paymentsConfig } from "@/lib/payments/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundRegistration, refundRegistrationById, type RefundResult } from "@/lib/payments/refunds";
import type { FetchLike } from "@/lib/payments/razorpay";

const RID = "33333333-3333-4333-8333-333333333333";
const PAY = "pay_P4REF0000001";
const AMOUNT = 19900;
const CREDS = { keyId: "rzp_test_ABCDEFGH1234", keySecret: "k_secret_000000" };
type Res = { data: unknown; error: unknown };
type Refund = { id: string; payment_id: string; amount: number; status: string; notes: Record<string, string> };

const claimed: Res = { data: { registration_id: RID, payment_id: PAY, amount_paise: AMOUNT }, error: null };
const marked = (outcome = "refunded"): Res => ({ data: { outcome, status: "refunded" }, error: null });

/** Supabase fake: `claim_refund` always grants the lease unless told otherwise (simulates a lapsed lease). */
function fakeDb(results: Partial<Record<"claim_refund" | "mark_refunded", Res | (() => Res)>> = {}) {
  const rpc = vi.fn(async (name: string) => {
    const r = results[name as "claim_refund" | "mark_refunded"];
    return typeof r === "function" ? r() : (r ?? { data: null, error: null });
  });
  return { db: { rpc } as never, rpc };
}

const timeout = () => Object.assign(new Error(`aborted ${CREDS.keySecret}`), { name: "TimeoutError" });

/**
 * Stateful Razorpay fake. Like the real API it refuses a refund larger than what is left of the payment, so a
 * second full refund is impossible; `posted` counts the refunds actually created.
 */
function fakeRazorpay(opts: {
  refunds?: Refund[];
  post?: "ok" | "timeout_after_create" | "timeout_before_create" | "http_500" | "failed_status" | "foreign_payment";
  get?: "ok" | "http_500" | "timeout";
} = {}) {
  const refunds: Refund[] = [...(opts.refunds ?? [])];
  let seq = 0;
  const posted: Refund[] = [];
  const fetch = vi.fn<FetchLike>(async (url, init) => {
    const path = url.replace("https://api.razorpay.com/v1", "");
    if (init.method === "GET" && path === `/payments/${PAY}/refunds`) {
      if (opts.get === "http_500") return Response.json({ error: { code: "SERVER_ERROR" } }, { status: 500 });
      if (opts.get === "timeout") throw timeout();
      return Response.json({ entity: "collection", count: refunds.length, items: refunds });
    }
    if (init.method === "POST" && path === `/payments/${PAY}/refund`) {
      if (opts.post === "timeout_before_create") throw timeout();
      if (opts.post === "http_500") return Response.json({ error: { code: "SERVER_ERROR" } }, { status: 500 });
      const body = JSON.parse(String(init.body)) as { amount: number; notes: Record<string, string> };
      const used = refunds.filter((r) => r.status !== "failed").reduce((s, r) => s + r.amount, 0);
      if (used + body.amount > AMOUNT) {
        return Response.json({ error: { code: "BAD_REQUEST_ERROR", description: "exceeds" } }, { status: 400 });
      }
      const r: Refund = {
        id: `rfnd_P4REF000000${++seq}`,
        payment_id: opts.post === "foreign_payment" ? "pay_SOMEONEELSE1" : PAY,
        amount: body.amount,
        status: opts.post === "failed_status" ? "failed" : "processed",
        notes: body.notes,
      };
      refunds.push(r);
      posted.push(r);
      if (opts.post === "timeout_after_create") throw timeout();
      return Response.json(r);
    }
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  });
  const calls = () => fetch.mock.calls.map(([u, i]) => `${i.method} ${u.replace("https://api.razorpay.com/v1", "")}`);
  return { fetch, posted, refunds, calls };
}

const run = (fetch: FetchLike, db: never, id = RID) => refundRegistration({ creds: CREDS, fetch, db }, id);
const markArgs = (refundId: string, amount = AMOUNT) => ({
  p_registration_id: RID, p_payment_id: PAY, p_refund_id: refundId, p_amount_paise: amount, p_source: "refund_api",
});
const noSecret = (r: RefundResult) => expect(JSON.stringify(r)).not.toContain(CREDS.keySecret);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(paymentsConfig).mockReset().mockReturnValue({ enabled: false });
  vi.mocked(createAdminClient).mockReset();
});

describe("refundRegistration", () => {
  it("claims, checks existing refunds, refunds the full amount with our notes, then records it", async () => {
    const { db, rpc } = fakeDb({ claim_refund: claimed, mark_refunded: marked() });
    const rz = fakeRazorpay();
    expect(await run(rz.fetch, db)).toEqual({ ok: true, outcome: "refunded", refundId: "rfnd_P4REF0000001" });
    expect(rz.calls()).toEqual([`GET /payments/${PAY}/refunds`, `POST /payments/${PAY}/refund`]);
    expect(JSON.parse(String(rz.fetch.mock.calls[1][1].body))).toEqual({
      amount: AMOUNT, speed: "normal", notes: { source: "stairway", registration_id: RID },
    });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["claim_refund", "mark_refunded"]);
    expect(rpc).toHaveBeenNthCalledWith(1, "claim_refund", { p_registration_id: RID });
    expect(rpc).toHaveBeenLastCalledWith("mark_refunded", markArgs("rfnd_P4REF0000001"));
  });

  it("reuses an existing full refund instead of creating a second one (crashed earlier attempt)", async () => {
    const { db, rpc } = fakeDb({ claim_refund: claimed, mark_refunded: marked() });
    const rz = fakeRazorpay({
      refunds: [
        { id: "rfnd_OLDFAILED01", payment_id: PAY, amount: AMOUNT, status: "failed", notes: {} },
        { id: "rfnd_EARLIER0001", payment_id: PAY, amount: AMOUNT, status: "processed", notes: {} },
      ],
    });
    expect(await run(rz.fetch, db)).toEqual({ ok: true, outcome: "already_refunded", refundId: "rfnd_EARLIER0001" });
    expect(rz.posted).toEqual([]);
    expect(rpc).toHaveBeenLastCalledWith("mark_refunded", markArgs("rfnd_EARLIER0001"));
  });

  it("reuses a pending full refund too (it is already on its way)", async () => {
    const { db } = fakeDb({ claim_refund: claimed, mark_refunded: marked() });
    const rz = fakeRazorpay({ refunds: [{ id: "rfnd_PENDING0001", payment_id: PAY, amount: AMOUNT, status: "pending", notes: {} }] });
    expect(await run(rz.fetch, db)).toEqual({ ok: true, outcome: "already_refunded", refundId: "rfnd_PENDING0001" });
    expect(rz.posted).toEqual([]);
  });

  it("ignores failed refunds and refunds again", async () => {
    const { db } = fakeDb({ claim_refund: claimed, mark_refunded: marked() });
    const rz = fakeRazorpay({ refunds: [{ id: "rfnd_OLDFAILED01", payment_id: PAY, amount: AMOUNT, status: "failed", notes: {} }] });
    expect(await run(rz.fetch, db)).toMatchObject({ ok: true, outcome: "refunded" });
    expect(rz.posted).toHaveLength(1);
  });

  it("never tops up a partial refund (full refunds only): an admin must look", async () => {
    const { db, rpc } = fakeDb({ claim_refund: claimed, mark_refunded: marked() });
    const rz = fakeRazorpay({ refunds: [{ id: "rfnd_PARTIAL0001", payment_id: PAY, amount: 5000, status: "processed", notes: {} }] });
    expect(await run(rz.fetch, db)).toEqual({ ok: false, reason: "razorpay_error", code: "PARTIALLY_REFUNDED" });
    expect(rz.posted).toEqual([]);
    expect(rpc).not.toHaveBeenCalledWith("mark_refunded", expect.anything());
  });

  it("does not POST when the existing refunds cannot be read", async () => {
    for (const get of ["http_500", "timeout"] as const) {
      const { db, rpc } = fakeDb({ claim_refund: claimed });
      const rz = fakeRazorpay({ get });
      const r = await run(rz.fetch, db);
      expect(r).toEqual({ ok: false, reason: "razorpay_error", code: get === "timeout" ? "TIMEOUT" : "SERVER_ERROR" });
      noSecret(r);
      expect(rz.posted).toEqual([]);
      expect(rpc).not.toHaveBeenCalledWith("mark_refunded", expect.anything());
    }
  });

  it("re-reads the refunds after a POST timeout and records the refund that was created", async () => {
    const { db, rpc } = fakeDb({ claim_refund: claimed, mark_refunded: marked() });
    const rz = fakeRazorpay({ post: "timeout_after_create" });
    const r = await run(rz.fetch, db);
    expect(r).toEqual({ ok: true, outcome: "refunded", refundId: "rfnd_P4REF0000001" });
    expect(rz.calls()).toEqual([`GET /payments/${PAY}/refunds`, `POST /payments/${PAY}/refund`, `GET /payments/${PAY}/refunds`]);
    expect(rz.posted).toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith("mark_refunded", markArgs("rfnd_P4REF0000001"));
  });

  it("after a POST timeout with no refund created, reports TIMEOUT and does not POST again (the next run re-reads first)", async () => {
    const { db, rpc } = fakeDb({ claim_refund: claimed });
    const rz = fakeRazorpay({ post: "timeout_before_create" });
    const r = await run(rz.fetch, db);
    expect(r).toEqual({ ok: false, reason: "razorpay_error", code: "TIMEOUT" });
    noSecret(r);
    expect(rz.calls().filter((c) => c.startsWith("POST"))).toHaveLength(1);
    expect(rpc).not.toHaveBeenCalledWith("mark_refunded", expect.anything());
  });

  it("reports a Razorpay refusal with its sanitised code and marks nothing", async () => {
    const { db, rpc } = fakeDb({ claim_refund: claimed });
    const rz = fakeRazorpay({ post: "http_500" });
    expect(await run(rz.fetch, db)).toEqual({ ok: false, reason: "razorpay_error", code: "SERVER_ERROR" });
    expect(rpc).not.toHaveBeenCalledWith("mark_refunded", expect.anything());
  });

  it("does not record a refund Razorpay reports as failed, or one for another payment", async () => {
    for (const [post, code] of [["failed_status", "REFUND_FAILED"], ["foreign_payment", "BAD_RESPONSE"]] as const) {
      const { db, rpc } = fakeDb({ claim_refund: claimed, mark_refunded: marked() });
      const rz = fakeRazorpay({ post });
      expect(await run(rz.fetch, db)).toEqual({ ok: false, reason: "razorpay_error", code });
      expect(rpc).not.toHaveBeenCalledWith("mark_refunded", expect.anything());
    }
  });

  it("is safe under a lapsed lease: a second run after a crash before recording creates no second refund", async () => {
    let first = true;
    const { db, rpc } = fakeDb({
      claim_refund: claimed,
      mark_refunded: () => {
        if (first) {
          first = false;
          return { data: null, error: { message: "connection reset", code: "08006" } };
        }
        return marked();
      },
    });
    const rz = fakeRazorpay();
    expect(await run(rz.fetch, db)).toEqual({ ok: false, reason: "db_error" });
    expect(await run(rz.fetch, db)).toEqual({ ok: true, outcome: "already_refunded", refundId: "rfnd_P4REF0000001" });
    expect(rz.posted).toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith("mark_refunded", markArgs("rfnd_P4REF0000001"));
  });

  it("is safe under double invocation racing past the lease: exactly one refund is created", async () => {
    const { db } = fakeDb({ claim_refund: claimed, mark_refunded: marked() });
    const rz = fakeRazorpay();
    const [a, b] = await Promise.all([run(rz.fetch, db), run(rz.fetch, db)]);
    expect(rz.posted).toHaveLength(1);
    for (const r of [a, b]) expect(r).toMatchObject({ ok: true, refundId: "rfnd_P4REF0000001" });
  });

  it("maps claim refusals without calling Razorpay", async () => {
    for (const [message, reason] of [
      ["registration_not_found", "not_found"], ["not_refundable", "not_refundable"], ["refund_in_progress", "in_progress"],
      ["boom", "db_error"],
    ] as const) {
      const { db } = fakeDb({ claim_refund: { data: null, error: { message, code: "P0001" } } });
      const rz = fakeRazorpay();
      expect(await run(rz.fetch, db)).toEqual({ ok: false, reason });
      expect(rz.fetch).not.toHaveBeenCalled();
    }
    const { db, rpc } = fakeDb({});
    expect(await run(fakeRazorpay().fetch, db, "nope")).toEqual({ ok: false, reason: "not_found" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a malformed claim or a throwing database client as db_error", async () => {
    for (const data of [null, { payment_id: "not-a-payment", amount_paise: AMOUNT }, { payment_id: PAY, amount_paise: 0 }]) {
      const { db } = fakeDb({ claim_refund: { data, error: null } });
      const rz = fakeRazorpay();
      expect(await run(rz.fetch, db)).toEqual({ ok: false, reason: "db_error" });
      expect(rz.fetch).not.toHaveBeenCalled();
    }
    const db = { rpc: vi.fn(async () => { throw new Error("fetch failed"); }) } as never;
    expect(await run(fakeRazorpay().fetch, db)).toEqual({ ok: false, reason: "db_error" });
  });

  it("maps the recording outcomes", async () => {
    for (const [outcome, expected] of [
      ["refunded", { ok: true, outcome: "refunded", refundId: "rfnd_P4REF0000001" }],
      ["already_refunded", { ok: true, outcome: "already_refunded", refundId: "rfnd_P4REF0000001" }],
      ["partial_refund", { ok: false, reason: "razorpay_error", code: "PARTIAL_REFUND" }],
      ["unknown_payment", { ok: false, reason: "db_error" }],
    ] as const) {
      const { db } = fakeDb({ claim_refund: claimed, mark_refunded: marked(outcome) });
      expect(await run(fakeRazorpay().fetch, db)).toEqual(expected);
    }
    const { db } = fakeDb({ claim_refund: claimed, mark_refunded: { data: null, error: { message: "x", code: "XX000" } } });
    expect(await run(fakeRazorpay().fetch, db)).toEqual({ ok: false, reason: "db_error" });
  });
});

describe("refundRegistrationById", () => {
  it("does nothing while payments are off: no client, no network", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await refundRegistrationById(RID)).toEqual({ ok: false, reason: "disabled" });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it("builds a per-call service client and uses the configured credentials when on", async () => {
    vi.mocked(paymentsConfig).mockReturnValue({
      enabled: true, keyId: CREDS.keyId, keySecret: CREDS.keySecret, webhookSecret: "whsec_value_000", serviceRoleKey: "service_role_key_value_0000",
    });
    const { db } = fakeDb({ claim_refund: claimed, mark_refunded: marked() });
    vi.mocked(createAdminClient).mockReturnValue(db);
    const rz = fakeRazorpay();
    vi.stubGlobal("fetch", rz.fetch);
    const r = await refundRegistrationById(RID);
    expect(r).toEqual({ ok: true, outcome: "refunded", refundId: "rfnd_P4REF0000001" });
    noSecret(r);
    expect(createAdminClient).toHaveBeenCalledWith("service_role_key_value_0000");
    const auth = new Headers(rz.fetch.mock.calls[0][1].headers).get("authorization");
    expect(auth).toBe(`Basic ${btoa(`${CREDS.keyId}:${CREDS.keySecret}`)}`);
  });
});
