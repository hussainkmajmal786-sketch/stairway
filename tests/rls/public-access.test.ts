import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const env = loadEnv("test", process.cwd(), "");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const live = !!url && !!key;

// These tests hit the real Supabase project with the public anon key, so they need
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local (or CI env vars).
// Without them the whole suite is skipped. They only make anonymous requests and are written
// so that a regressed policy fails the test without changing any production data.

describe.skipIf(!live)("RLS as an anonymous visitor", () => {
  const db = createClient(url!, key!, { auth: { persistSession: false } });

  it("can read published events", async () => {
    const { data, error } = await db.from("events").select("slug, status");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((e) => e.status === "published")).toBe(true);
  });

  it("cannot insert events", async () => {
    const slug = "rls-test-should-not-exist";
    const soc = await db.from("societies").select("id").limit(1).single();
    expect(soc.error).toBeNull();

    // A complete, otherwise-valid row: the only thing that can reject it is RLS.
    const { error } = await db.from("events").insert({
      society_id: soc.data!.id,
      step_number: 999,
      slug,
      title: "RLS test (must not exist)",
      starts_at: "2099-01-01T09:00:00+05:30",
      ends_at: "2099-01-01T16:00:00+05:30",
      status: "published",
    } as never);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501"); // insufficient_privilege: row-level security violation

    const { data } = await db.from("events").select("slug").eq("slug", slug);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot change site content", async () => {
    const before = await db.from("site_blocks").select("data").eq("key", "settings").single();
    expect(before.error).toBeNull();

    // Write back the exact same value, so even a regressed policy changes nothing.
    const update = await db
      .from("site_blocks")
      .update({ data: before.data!.data })
      .eq("key", "settings")
      .select();
    // RLS hides the row from the UPDATE: zero rows come back (broken RLS would return 1).
    expect(update.data ?? []).toHaveLength(0);

    const after = await db.from("site_blocks").select("data").eq("key", "settings").single();
    expect(after.error).toBeNull();
    expect(after.data!.data).toEqual(before.data!.data);
  });

  it("cannot read or write admin roles", async () => {
    // Only the 42501 (RLS) error proves the policy refused the write. A successful insert
    // would fail the test (error would be null); with RLS off it would instead fail the
    // FK on auth.users with a different code, which also fails this assertion.
    const { error } = await db
      .from("admin_roles")
      .insert({ user_id: crypto.randomUUID(), role: "super_admin" } as never);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");

    const { data } = await db.from("admin_roles").select("*");
    expect(data ?? []).toHaveLength(0);
  });
});
