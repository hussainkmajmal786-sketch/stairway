import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const env = loadEnv("test", process.cwd(), "");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const live = !!url && !!key;

describe.skipIf(!live)("RLS as an anonymous visitor", () => {
  const db = createClient(url!, key!, { auth: { persistSession: false } });

  it("can read published events", async () => {
    const { data, error } = await db.from("events").select("slug, status");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((e) => e.status === "published")).toBe(true);
  });

  it("cannot insert events", async () => {
    const { error } = await db.from("events").insert({ slug: "hack", title: "x" } as never);
    expect(error).not.toBeNull();
    const { data } = await db.from("events").select("slug").eq("slug", "hack");
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot change site content", async () => {
    const update = await db
      .from("site_blocks")
      .update({ data: { name: "defaced" } })
      .eq("key", "settings")
      .select();
    // RLS either errors or silently matches zero rows; it must never return a changed row.
    expect(update.data ?? []).toHaveLength(0);

    // Prove the row is untouched, not just that the update returned nothing.
    const { data, error } = await db.from("site_blocks").select("data").eq("key", "settings").single();
    expect(error).toBeNull();
    expect((data!.data as { name: string }).name).toBe("st(AI)rway");
  });

  it("cannot list admin roles", async () => {
    const { data } = await db.from("admin_roles").select("*");
    expect(data ?? []).toHaveLength(0);
  });
});
