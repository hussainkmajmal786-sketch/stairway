import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/payments/config", () => ({ cronSecret: vi.fn(), paymentsConfig: vi.fn(), syncConfig: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ rpc: vi.fn() })) }));
vi.mock("@/lib/cron/tick", () => ({ runTick: vi.fn() }));

import { cronSecret, paymentsConfig, syncConfig } from "@/lib/payments/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTick } from "@/lib/cron/tick";
import { POST } from "@/app/api/cron/tick/route";

const SECRET = "c".repeat(32);
const call = (auth?: string) =>
  POST(new Request("https://stairway.internal/api/cron/tick", { method: "POST", headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cronSecret).mockReturnValue(SECRET);
  vi.mocked(paymentsConfig).mockReturnValue({ enabled: false });
  vi.mocked(syncConfig).mockReturnValue({ enabled: false });
  vi.mocked(runTick).mockResolvedValue({ holds: null, sync: null, errors: [] });
});

describe("POST /api/cron/tick", () => {
  it("is not found without a configured secret and unauthorised with a wrong one", async () => {
    vi.mocked(cronSecret).mockReturnValueOnce(null);
    expect((await call(`Bearer ${SECRET}`)).status).toBe(404);
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${"x".repeat(32)}`)).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401);
    expect(runTick).not.toHaveBeenCalled();
  });
  it("skips when nothing is enabled", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: true });
    expect(runTick).not.toHaveBeenCalled();
  });
  it("runs the tick with the service-role key and returns counts only", async () => {
    vi.mocked(paymentsConfig).mockReturnValue({
      enabled: true, keyId: "rzp_test_ABCDEFGH1234", keySecret: "k".repeat(16), webhookSecret: "w".repeat(16), serviceRoleKey: "srk_" + "x".repeat(20),
    });
    vi.mocked(syncConfig).mockReturnValue({ enabled: true, url: "https://fe.example/x", secret: "s".repeat(32), serviceRoleKey: "srk_" + "x".repeat(20) });
    vi.mocked(runTick).mockResolvedValue({ holds: { events: 1, expired: 1, promoted: 0 }, sync: null, errors: [] });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, holds: { events: 1, expired: 1, promoted: 0 }, sync: null, errors: [] });
    const deps = vi.mocked(runTick).mock.calls[0][0];
    expect(deps.payments).toBe(true);
    expect(deps.sync).toEqual({ url: "https://fe.example/x", secret: "s".repeat(32) });
    deps.db();
    expect(createAdminClient).toHaveBeenCalledWith("srk_" + "x".repeat(20));
  });
  it("answers 500 when a step failed", async () => {
    vi.mocked(syncConfig).mockReturnValue({ enabled: true, url: "https://fe.example/x", secret: "s".repeat(32), serviceRoleKey: "srk_" + "x".repeat(20) });
    vi.mocked(runTick).mockResolvedValue({ holds: null, sync: null, errors: ["sync:Error"] });
    expect((await call(`Bearer ${SECRET}`)).status).toBe(500);
  });
});
