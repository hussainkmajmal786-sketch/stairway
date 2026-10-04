import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "@/lib/env";

describe("parsePublicEnv", () => {
  it("accepts a valid url and key", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_1234567890abcdef",
    });
    expect(env.supabaseUrl).toBe("https://abc.supabase.co");
  });
  it("throws a readable error when missing", () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
