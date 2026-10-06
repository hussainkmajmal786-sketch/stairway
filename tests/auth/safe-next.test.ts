import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";

describe("safeNext", () => {
  it("keeps same-origin relative paths with query and hash", () => {
    expect(safeNext("/me")).toBe("/me");
    expect(safeNext("/events/x?y=1#z")).toBe("/events/x?y=1#z");
  });
  it("falls back for missing or empty values", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null, "/me")).toBe("/me");
    expect(safeNext("", "/me")).toBe("/me");
  });
  it("rejects absolute, protocol-relative and backslash tricks", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "\\\\evil.com", "javascript:alert(1)", "evil.com"])
      expect(safeNext(bad, "/safe")).toBe("/safe");
  });
  it("rejects control characters", () => {
    expect(safeNext("/me\n/evil", "/safe")).toBe("/safe");
  });
  it("rejects dot-segment tricks that collapse into a protocol-relative URL", () => {
    for (const bad of ["/..//evil.com", "/.//evil.com", "/a/..//evil.com", "/%2e%2e//evil.com", "/\t/evil.com"])
      expect(safeNext(bad, "/safe")).toBe("/safe");
  });
  it("rejects auth pages in any spelling but allows lookalikes", () => {
    for (const bad of ["/login/", "/auth", "/%6Cogin", "/%61uth/x", "/LOGIN"])
      expect(safeNext(bad, "/safe")).toBe("/safe");
    expect(safeNext("/loginx", "/safe")).toBe("/loginx");
    expect(safeNext("/events/login-help", "/safe")).toBe("/events/login-help");
  });
  it("never redirects back into the auth pages", () => {
    expect(safeNext("/login?next=/me", "/safe")).toBe("/safe");
    expect(safeNext("/auth/callback", "/safe")).toBe("/safe");
  });
});
