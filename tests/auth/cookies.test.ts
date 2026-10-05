import { describe, expect, it } from "vitest";
import { hasSupabaseSessionCookie } from "@/lib/auth/cookies";

describe("hasSupabaseSessionCookie", () => {
  it("detects a plain and a chunked auth-token cookie", () => {
    expect(hasSupabaseSessionCookie(["a", "sb-abc-auth-token"])).toBe(true);
    expect(hasSupabaseSessionCookie(["sb-abc-auth-token.0", "sb-abc-auth-token.1"])).toBe(true);
  });
  it("ignores the PKCE code verifier and unrelated cookies", () => {
    expect(hasSupabaseSessionCookie(["sb-abc-auth-token-code-verifier"])).toBe(false);
    expect(hasSupabaseSessionCookie(["theme", "stairway-announce-dismissed"])).toBe(false);
    expect(hasSupabaseSessionCookie([])).toBe(false);
  });
});
