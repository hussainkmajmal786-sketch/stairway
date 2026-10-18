import { describe, expect, it, vi } from "vitest";
import { runTick } from "@/lib/cron/tick";
import type { FetchLike } from "@/lib/payments/razorpay";

function fakeDb(results: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn(async (name: string) => results[name] ?? { data: null, error: null });
  const remove = vi.fn(async (paths: string[]) => (void paths,  ({ data: [], error: null as unknown })));
  const from = vi.fn(() => ({ remove }));
  const factory = vi.fn(() => ({ rpc, storage: { from } }) as never);
  return { factory, rpc, remove, from };
}
const NOON = Date.UTC(2026, 9, 18, 12, 0, 0);
const WINDOW = Date.UTC(2026, 9, 18, 21, 2, 0);
const SYNC = { url: "https://fe.example/functions/v1/external-sync", secret: "s".repeat(32) };

describe("runTick", () => {
  it("does nothing (not even a DB client) when nothing is enabled", async () => {
    const { factory } = fakeDb({});
    expect(await runTick({ payments: false, sync: null, db: factory, fetch: vi.fn<FetchLike>(), now: () => NOON }))
      .toEqual({ holds: null, sync: null, purge: null, errors: [] });
    expect(factory).not.toHaveBeenCalled();
  });
  it("expires holds when payments are on", async () => {
    const { factory, rpc } = fakeDb({ expire_holds: { data: { events: 2, expired: 3, promoted: 1 }, error: null } });
    const r = await runTick({ payments: true, sync: null, db: factory, fetch: vi.fn<FetchLike>(), now: () => NOON });
    expect(r).toEqual({ holds: { events: 2, expired: 3, promoted: 1 }, sync: null, purge: null, errors: [] });
    expect(rpc).toHaveBeenCalledWith("expire_holds", { p_limit: 50 });
    expect(rpc).not.toHaveBeenCalledWith("claim_sync_batch", expect.anything());
  });
  it("drains the outbox when sync is on, and keeps going after a failed step", async () => {
    const { factory } = fakeDb({
      expire_holds: { data: null, error: { code: "57014", message: "timeout" } },
      claim_sync_batch: { data: [], error: null },
    });
    const r = await runTick({ payments: true, sync: SYNC, db: factory, fetch: vi.fn<FetchLike>(), now: () => NOON });
    expect(r.errors).toEqual(["expire_holds:57014"]);
    expect(r.sync).toEqual({ claimed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 });
    expect(factory).toHaveBeenCalledTimes(1);
  });
  it("reports a failed sync claim without throwing", async () => {
    const { factory } = fakeDb({ claim_sync_batch: { data: null, error: { code: "XX000", message: "x" } } });
    const r = await runTick({ payments: false, sync: SYNC, db: factory, fetch: vi.fn<FetchLike>(), now: () => NOON });
    expect(r.errors).toEqual(["sync:Error"]);
  });

  describe("community purge", () => {
    const HOLDS = { data: { events: 0, expired: 0, promoted: 0 }, error: null };
    const purged = (paths: string[]) => ({ expire_holds: HOLDS, purge_community: { data: { threads: 0, proof_paths: paths }, error: null } });
    it("runs only inside the daily window and only when cron is enabled", async () => {
      const a = fakeDb(purged([]));
      await runTick({ payments: true, sync: null, db: a.factory, fetch: vi.fn<FetchLike>(), now: () => NOON });
      await runTick({ payments: true, sync: null, db: a.factory, fetch: vi.fn<FetchLike>(), now: () => Date.UTC(2026, 9, 18, 21, 5, 0) });
      expect(a.rpc).not.toHaveBeenCalledWith("purge_community");
      const b = fakeDb(purged([]));
      const r = await runTick({ payments: true, sync: null, db: b.factory, fetch: vi.fn<FetchLike>(), now: () => WINDOW });
      expect(b.rpc).toHaveBeenCalledWith("purge_community");
      expect(r.purge).toEqual({ ran: true, removed: 0 });
      expect(b.remove).not.toHaveBeenCalled();
      const c = fakeDb(purged([]));
      await runTick({ payments: false, sync: null, db: c.factory, fetch: vi.fn<FetchLike>(), now: () => WINDOW });
      expect(c.factory).not.toHaveBeenCalled();
    });
    it("deletes exactly the returned proof paths from the ieee-proof bucket", async () => {
      const d = fakeDb(purged(["u1/a.jpg", "u2/b.png"]));
      const r = await runTick({ payments: true, sync: null, db: d.factory, fetch: vi.fn<FetchLike>(), now: () => WINDOW });
      expect(d.from).toHaveBeenCalledWith("ieee-proof");
      expect(d.remove).toHaveBeenCalledWith(["u1/a.jpg", "u2/b.png"]);
      expect(r.purge).toEqual({ ran: true, removed: 2 });
      expect(r.errors).toEqual([]);
    });
    it("a failing purge or storage delete is reported by code only and does not stop holds or sync", async () => {
      const d = fakeDb({
        expire_holds: { data: { events: 0, expired: 0, promoted: 0 }, error: null },
        purge_community: { data: null, error: { code: "42501", message: "u1/secret.jpg" } },
        claim_sync_batch: { data: [], error: null },
      });
      const r = await runTick({ payments: true, sync: SYNC, db: d.factory, fetch: vi.fn<FetchLike>(), now: () => WINDOW });
      expect(r.errors).toEqual(["purge:42501"]);
      expect(r.holds).not.toBeNull();
      expect(r.sync).not.toBeNull();
      const e = fakeDb(purged(["u1/a.jpg"]));
      e.remove.mockResolvedValueOnce({ data: [], error: { message: "u1/a.jpg" } });
      const r2 = await runTick({ payments: true, sync: null, db: e.factory, fetch: vi.fn<FetchLike>(), now: () => WINDOW });
      expect(r2.errors).toEqual(["purge:storage"]);
      const f = fakeDb({ expire_holds: HOLDS, purge_community: { data: { nope: 1 }, error: null } });
      expect((await runTick({ payments: true, sync: null, db: f.factory, fetch: vi.fn<FetchLike>(), now: () => WINDOW })).errors).toEqual(["purge:shape"]);
    });
  });
});
