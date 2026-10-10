import { describe, expect, it, vi } from "vitest";
import { runTick } from "@/lib/cron/tick";
import type { FetchLike } from "@/lib/payments/razorpay";

function fakeDb(results: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn(async (name: string) => results[name] ?? { data: null, error: null });
  const factory = vi.fn(() => ({ rpc }) as never);
  return { factory, rpc };
}
const SYNC = { url: "https://fe.example/functions/v1/external-sync", secret: "s".repeat(32) };

describe("runTick", () => {
  it("does nothing (not even a DB client) when nothing is enabled", async () => {
    const { factory } = fakeDb({});
    expect(await runTick({ payments: false, sync: null, db: factory, fetch: vi.fn<FetchLike>() }))
      .toEqual({ holds: null, sync: null, errors: [] });
    expect(factory).not.toHaveBeenCalled();
  });
  it("expires holds when payments are on", async () => {
    const { factory, rpc } = fakeDb({ expire_holds: { data: { events: 2, expired: 3, promoted: 1 }, error: null } });
    const r = await runTick({ payments: true, sync: null, db: factory, fetch: vi.fn<FetchLike>() });
    expect(r).toEqual({ holds: { events: 2, expired: 3, promoted: 1 }, sync: null, errors: [] });
    expect(rpc).toHaveBeenCalledWith("expire_holds", { p_limit: 50 });
    expect(rpc).not.toHaveBeenCalledWith("claim_sync_batch", expect.anything());
  });
  it("drains the outbox when sync is on, and keeps going after a failed step", async () => {
    const { factory } = fakeDb({
      expire_holds: { data: null, error: { code: "57014", message: "timeout" } },
      claim_sync_batch: { data: [], error: null },
    });
    const r = await runTick({ payments: true, sync: SYNC, db: factory, fetch: vi.fn<FetchLike>() });
    expect(r.errors).toEqual(["expire_holds:57014"]);
    expect(r.sync).toEqual({ claimed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 });
    expect(factory).toHaveBeenCalledTimes(1);
  });
  it("reports a failed sync claim without throwing", async () => {
    const { factory } = fakeDb({ claim_sync_batch: { data: null, error: { code: "XX000", message: "x" } } });
    const r = await runTick({ payments: false, sync: SYNC, db: factory, fetch: vi.fn<FetchLike>() });
    expect(r.errors).toEqual(["sync:Error"]);
  });
});
