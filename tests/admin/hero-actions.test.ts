import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "k" } }));

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resetHeroConfig, saveHeroConfig } from "@/lib/admin/hero-actions";
import { fakeDb, wrote, type Res } from "./fake-db";

const SEEN = "2026-10-11T10:00:00.123456+00:00";
const NEW = "2026-10-11T10:05:00.000000+00:00";
const ok = (data: unknown): Res => ({ data, error: null });
const patch = {
  preset: "ink", headlineMode: "custom", customHeadline: "  Doors open soon ", ghostWord: "climb 26", primaryCta: "Join",
  secondaryCta: "", showStats: false, showFrameText: true,
};

/** The real authorize() runs against a session client whose getClaims and admin_roles come from the script. */
function session(opts: { sub?: string | null; roles?: { role: string; society_id: string | null }[]; script?: Record<string, Res | Res[]> }) {
  const { db, calls } = fakeDb({ "admin_roles.select": ok(opts.roles ?? []), ...(opts.script ?? {}) });
  const client = {
    ...db,
    auth: { getClaims: async () => ({ data: opts.sub === null ? null : { claims: { sub: opts.sub ?? "u1" } }, error: null }) },
  };
  vi.mocked(createClient).mockResolvedValue(client as never);
  return calls;
}
const SUPER = [{ role: "super_admin", society_id: null }];
const SOCIETY = [{ role: "society_admin", society_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }];

beforeEach(() => vi.clearAllMocks());

describe("saveHeroConfig authorization", () => {
  it.each([
    ["signed out", { sub: null }],
    ["plain user", { roles: [] }],
    ["society admin", { roles: SOCIETY }],
  ])("rejects %s without touching site_blocks", async (_n, opts) => {
    const calls = session(opts);
    const r = await saveHeroConfig({ patch, seenUpdatedAt: SEEN });
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(calls.some((c) => c.table === "site_blocks")).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("rejects before looking at the input", async () => {
    session({ roles: SOCIETY });
    expect(await resetHeroConfig("garbage")).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("saveHeroConfig", () => {
  it("saves for a super admin, normalising values, with the optimistic check, and revalidates", async () => {
    const calls = session({
      roles: SUPER,
      script: { "site_blocks.select": ok({ data: {}, updated_at: SEEN }), "site_blocks.update": ok([{ updated_at: NEW }]) },
    });
    const r = await saveHeroConfig({ patch, seenUpdatedAt: SEEN });
    expect(r).toEqual({ ok: true, data: { updatedAt: NEW } });
    const upd = wrote(calls, "site_blocks", "update")[0];
    expect(upd.args[0]).toEqual({
      data: { preset: "ink", headlineMode: "custom", customHeadline: "Doors open soon", ghostWord: "CLIMB 26", primaryCta: "Join", showStats: false, showFrameText: true },
    });
    expect(calls.filter((c) => c.table === "site_blocks" && c.op === "eq").map((c) => c.args)).toContainEqual(["updated_at", SEEN]);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("keeps fields the editor does not own and drops cleared optional ones", async () => {
    const calls = session({
      roles: SUPER,
      script: {
        "site_blocks.select": ok({ data: { future: { a: 1 }, ghostWord: "OLD", customHeadline: "Old" }, updated_at: SEEN }),
        "site_blocks.update": ok([{ updated_at: NEW }]),
      },
    });
    const r = await saveHeroConfig({ patch: { ...patch, headlineMode: "auto", customHeadline: "", ghostWord: "" }, seenUpdatedAt: SEEN });
    expect(r.ok).toBe(true);
    const written = (wrote(calls, "site_blocks", "update")[0].args[0] as { data: Record<string, unknown> }).data;
    expect(written.future).toEqual({ a: 1 });
    expect(written).not.toHaveProperty("ghostWord");
    expect(written).not.toHaveProperty("customHeadline");
  });

  it("creates the block when none exists and the editor saw none", async () => {
    const calls = session({
      roles: SUPER,
      script: { "site_blocks.select": ok(null), "site_blocks.insert": ok({ updated_at: NEW }) },
    });
    expect(await saveHeroConfig({ patch, seenUpdatedAt: "" })).toEqual({ ok: true, data: { updatedAt: NEW } });
    expect(wrote(calls, "site_blocks", "insert")).toHaveLength(1);
  });

  it("returns a conflict when the stored updated_at differs", async () => {
    const calls = session({ roles: SUPER, script: { "site_blocks.select": ok({ data: {}, updated_at: NEW }) } });
    const r = await saveHeroConfig({ patch, seenUpdatedAt: SEEN });
    expect(r).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(wrote(calls, "site_blocks", "update")).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("returns a conflict when the update touches zero rows", async () => {
    session({ roles: SUPER, script: { "site_blocks.select": ok({ data: {}, updated_at: SEEN }), "site_blocks.update": ok([]) } });
    expect(await saveHeroConfig({ patch, seenUpdatedAt: SEEN })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("returns a conflict when the editor saw none but a block now exists", async () => {
    session({ roles: SUPER, script: { "site_blocks.select": ok({ data: {}, updated_at: NEW }) } });
    expect(await saveHeroConfig({ patch, seenUpdatedAt: "" })).toMatchObject({ ok: false, error: { code: "conflict" } });
  });

  it("rejects unknown keys (top level and in the patch) and never writes", async () => {
    const calls = session({ roles: SUPER, script: { "site_blocks.select": ok({ data: {}, updated_at: SEEN }) } });
    for (const input of [
      { patch: { ...patch, extra: 1 }, seenUpdatedAt: SEEN },
      { patch, seenUpdatedAt: SEEN, role: "super_admin" },
    ]) {
      expect(await saveHeroConfig(input)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(wrote(calls, "site_blocks", "update")).toHaveLength(0);
    expect(wrote(calls, "site_blocks", "insert")).toHaveLength(0);
  });
  it("rejects invalid values with per-field errors", async () => {
    session({ roles: SUPER, script: { "site_blocks.select": ok({ data: {}, updated_at: SEEN }) } });
    const r = await saveHeroConfig({
      patch: { ...patch, preset: "neon", ghostWord: "no!", primaryCta: "x".repeat(25), customHeadline: "a\u0007b" },
      seenUpdatedAt: SEEN,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.error.fieldErrors ?? {})).toEqual(expect.arrayContaining(["preset", "ghostWord", "primaryCta", "customHeadline"]));
  });
  it("requires a headline in custom mode", async () => {
    session({ roles: SUPER });
    const r = await saveHeroConfig({ patch: { ...patch, customHeadline: " " }, seenUpdatedAt: SEEN });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input", fieldErrors: { customHeadline: expect.any(String) } } });
  });
});

describe("resetHeroConfig", () => {
  it("deletes the block when only owned keys are stored", async () => {
    const calls = session({
      roles: SUPER,
      script: { "site_blocks.select": ok({ data: { preset: "ink" }, updated_at: SEEN }), "site_blocks.delete": ok([{ key: "hero" }]) },
    });
    expect(await resetHeroConfig({ seenUpdatedAt: SEEN })).toEqual({ ok: true, data: { updatedAt: "" } });
    expect(wrote(calls, "site_blocks", "delete")).toHaveLength(1);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
  it("keeps unowned fields when resetting", async () => {
    const calls = session({
      roles: SUPER,
      script: { "site_blocks.select": ok({ data: { preset: "ink", other: 1 }, updated_at: SEEN }), "site_blocks.update": ok([{ updated_at: NEW }]) },
    });
    expect(await resetHeroConfig({ seenUpdatedAt: SEEN })).toEqual({ ok: true, data: { updatedAt: NEW } });
    expect(wrote(calls, "site_blocks", "update")[0].args[0]).toEqual({ data: { other: 1 } });
  });
  it("conflicts on a stale updated_at and on zero rows", async () => {
    session({ roles: SUPER, script: { "site_blocks.select": ok({ data: { preset: "ink" }, updated_at: NEW }) } });
    expect(await resetHeroConfig({ seenUpdatedAt: SEEN })).toMatchObject({ ok: false, error: { code: "conflict" } });
    session({
      roles: SUPER,
      script: { "site_blocks.select": ok({ data: { preset: "ink" }, updated_at: SEEN }), "site_blocks.delete": ok([]) },
    });
    expect(await resetHeroConfig({ seenUpdatedAt: SEEN })).toMatchObject({ ok: false, error: { code: "conflict" } });
  });
  it("is a no-op when there is nothing stored", async () => {
    const calls = session({ roles: SUPER, script: { "site_blocks.select": ok(null) } });
    expect(await resetHeroConfig({ seenUpdatedAt: "" })).toEqual({ ok: true, data: { updatedAt: "" } });
    expect(wrote(calls, "site_blocks", "delete")).toHaveLength(0);
  });
});

describe("boundaries", () => {
  it("the hero actions and editor never import the service-role client or secrets", () => {
    for (const f of ["lib/admin/hero-actions.ts", "lib/admin/hero-schema.ts", "lib/admin/hero-editor.ts", "components/admin/HeroEditor.tsx", "app/admin/site/hero/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/supabase\/admin|SERVICE_ROLE|createAdminClient/);
    }
  });
  it("sends no string to log_admin_event (audit is the site_blocks trigger)", () => {
    expect(readFileSync("lib/admin/hero-actions.ts", "utf8")).not.toMatch(/log_admin_event/);
  });
});
