import { describe, expect, it, vi } from "vitest";
import { processOutbox } from "@/lib/sync/processor";
import type { FetchLike } from "@/lib/payments/razorpay";

const URL_ = "https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync";
const SECRET = "s".repeat(32);
const row = (n: number, type = "registration.confirmed") => ({
  id: `55555555-5555-4555-8555-55555555555${n}`, event_type: type, idempotency_key: `k${n}`,
  payload: { registration: { id: `r${n}` } }, attempts: 1, created_at: "2026-10-10T10:00:00+00:00",
});

function fakeDb(batch: unknown, claimError: unknown = null) {
  const completes: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "claim_sync_batch") return { data: batch, error: claimError };
    completes.push(args);
    return { data: args.p_ok ? "sent" : args.p_permanent ? "dead" : "failed", error: null };
  });
  return { db: { rpc } as never, rpc, completes };
}

describe("processOutbox", () => {
  it("does nothing for an empty batch", async () => {
    const { db } = fakeDb([]);
    const f = vi.fn<FetchLike>();
    expect(await processOutbox({ db, fetch: f, url: URL_, secret: SECRET })).toEqual({ claimed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 });
    expect(f).not.toHaveBeenCalled();
  });
  it("posts each claimed row in order and completes it by outcome", async () => {
    const { db, rpc, completes } = fakeDb([row(1), row(2, "registration.cancelled"), row(3, "payment.refunded"), row(4)]);
    const statuses = [200, 503, 422];
    const f = vi.fn<FetchLike>(async () => {
      const s = statuses.shift();
      if (s === undefined) throw new TypeError("fetch failed");
      return new Response(s === 422 ? '{"error":"conflict_existing_order"}' : "{}", { status: s });
    });
    const report = await processOutbox({ db, fetch: f, url: URL_, secret: SECRET });
    expect(report).toEqual({ claimed: 4, sent: 1, failed: 2, dead: 1, skipped: 0 });
    expect(rpc).toHaveBeenNthCalledWith(1, "claim_sync_batch", { p_limit: 10 });
    expect(f.mock.calls.map((c) => JSON.parse(String(c[1].body)).idempotency_key)).toEqual(["k1", "k2", "k3", "k4"]);
    expect(f.mock.calls[0][0]).toBe(URL_);
    expect(completes).toEqual([
      { p_id: row(1).id, p_ok: true, p_permanent: false, p_error: undefined },
      { p_id: row(2).id, p_ok: false, p_permanent: false, p_error: "HTTP 503" },
      { p_id: row(3).id, p_ok: false, p_permanent: true, p_error: "HTTP 422 conflict_existing_order" },
      { p_id: row(4).id, p_ok: false, p_permanent: false, p_error: "network" },
    ]);
  });
  it("stops sending when the time budget is spent (leased rows come back after 2 minutes)", async () => {
    const { db, completes } = fakeDb([row(1), row(2), row(3)]);
    let t = 0;
    const now = () => t;
    const f = vi.fn<FetchLike>(async () => {
      t += 15_000;
      return new Response("{}", { status: 200 });
    });
    const report = await processOutbox({ db, fetch: f, url: URL_, secret: SECRET, now, budgetMs: 20_000 });
    expect(report).toMatchObject({ claimed: 3, sent: 2, skipped: 1 });
    expect(completes).toHaveLength(2);
  });
  it("never follows a redirect: any 3xx is a transient 'redirect' error, retried", async () => {
    const { db, completes } = fakeDb([row(1), row(2)]);
    const f = vi.fn<FetchLike>(async (_u, init) => {
      expect(init.redirect).toBe("manual");
      return new Response(null, { status: f.mock.calls.length === 1 ? 307 : 308, headers: { location: "https://evil.example/x" } });
    });
    const report = await processOutbox({ db, fetch: f, url: URL_, secret: SECRET });
    expect(report).toEqual({ claimed: 2, sent: 0, failed: 2, dead: 0, skipped: 0 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(completes.map((c) => [c.p_ok, c.p_permanent, c.p_error])).toEqual([
      [false, false, "redirect"],
      [false, false, "redirect"],
    ]);
  });
  it("treats an opaque redirect response as transient too", async () => {
    const { db, completes } = fakeDb([row(1)]);
    const f = vi.fn<FetchLike>(async () => ({ type: "opaqueredirect", status: 0, body: null, headers: new Headers() }) as unknown as Response);
    await processOutbox({ db, fetch: f, url: URL_, secret: SECRET });
    expect(completes[0]).toMatchObject({ p_ok: false, p_permanent: false, p_error: "redirect" });
  });
  it("caps the response body it reads (16 KiB): an oversized error body is ignored, status still decides", async () => {
    const { db, completes } = fakeDb([row(1), row(2)]);
    const big = `{"error":"conflict_existing_order","pad":"${"x".repeat(64 * 1024)}"}`;
    const f = vi.fn<FetchLike>(async () => new Response(big, { status: 422 }));
    const report = await processOutbox({ db, fetch: f, url: URL_, secret: SECRET });
    // Oversized: the body is not parsed (no code), 422 is still permanent.
    expect(completes.map((c) => c.p_error)).toEqual(["HTTP 422", "HTTP 422"]);
    expect(report.dead).toBe(2);
  });
  it("throws when the claim fails and ignores a malformed batch row", async () => {
    await expect(processOutbox({ db: fakeDb(null, { code: "XX000", message: "x" }).db, fetch: vi.fn<FetchLike>(), url: URL_, secret: SECRET }))
      .rejects.toThrow(/claim_sync_batch/);
    await expect(processOutbox({ db: fakeDb([{ id: "nope" }]).db, fetch: vi.fn<FetchLike>(), url: URL_, secret: SECRET }))
      .rejects.toThrow(/unexpected/);
  });
});
