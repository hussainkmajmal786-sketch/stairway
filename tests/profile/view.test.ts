import { describe, expect, it } from "vitest";
import { formatMonth, isHttpUrl, parseHandleParam, safeAvatarUrl, safeLinks } from "@/lib/profile/view";

describe("isHttpUrl", () => {
  it("accepts http(s) URLs in any case", () => {
    expect(isHttpUrl("https://github.com/a")).toBe(true);
    expect(isHttpUrl("HTTP://example.com")).toBe(true);
  });
  it("rejects other schemes, relative and non-string values", () => {
    for (const v of ["javascript:alert(1)", " javascript:alert(1)", "data:text/html,x", "//evil.com", "/u/x", "https://", "", null, 5, {}])
      expect(isHttpUrl(v)).toBe(false);
  });
});

describe("safeLinks", () => {
  it("keeps known http(s) links in display order and drops unsafe or unknown ones", () => {
    expect(
      safeLinks({ website: "https://me.dev", github: "javascript:alert(1)", linkedin: "https://linkedin.com/in/a", evil: "https://e.com", x: 7 }),
    ).toEqual([
      { key: "linkedin", url: "https://linkedin.com/in/a" },
      { key: "website", url: "https://me.dev" },
    ]);
  });
  it("tolerates non-object jsonb", () => {
    expect(safeLinks(null)).toEqual([]);
    expect(safeLinks(["https://a.com"])).toEqual([]);
    expect(safeLinks("https://a.com")).toEqual([]);
  });
});

describe("parseHandleParam", () => {
  it("lowercases and decodes valid handles", () => {
    expect(parseHandleParam("Ajmal_99")).toBe("ajmal_99");
    expect(parseHandleParam("ab%2Dcd")).toBe("ab-cd");
  });
  it("rejects invalid or malformed handles", () => {
    for (const v of ["ab", "-abc", "a b c", "abc%", "%E0%A4%A", "x".repeat(31), "abc/def", "abc%2F..%2Fx"])
      expect(parseHandleParam(v)).toBeNull();
  });
});

describe("formatMonth", () => {
  it("formats a date-only value as month and year", () => {
    expect(formatMonth("2025-05-01")).toMatch(/May.*2025/);
    expect(formatMonth("2024-12-31")).toMatch(/Dec.*2024/);
  });
  it("returns empty for garbage", () => {
    expect(formatMonth("nope")).toBe("");
  });
});

describe("safeAvatarUrl", () => {
  const sb = "https://nfrdsdnrtsbttyrmfppy.supabase.co";
  it("allows https URLs on the Supabase storage host and Google photos", () => {
    const own = `${sb}/storage/v1/object/public/avatars/u1/a.webp`;
    expect(safeAvatarUrl(own, sb)).toBe(own);
    expect(safeAvatarUrl("https://lh3.googleusercontent.com/a/xyz=s96-c", sb)).toBe("https://lh3.googleusercontent.com/a/xyz=s96-c");
  });
  it("rejects http, other hosts, lookalikes, credentials and junk", () => {
    for (const v of [
      "http://nfrdsdnrtsbttyrmfppy.supabase.co/storage/v1/object/public/avatars/a.png",
      "https://evil.com/a.png",
      "https://nfrdsdnrtsbttyrmfppy.supabase.co.evil.com/a.png",
      "https://other.supabase.co/storage/v1/object/public/avatars/a.png",
      "https://x@lh3.googleusercontent.com/a",
      "javascript:alert(1)", "data:image/png;base64,AAAA", "", null, 3,
    ])
      expect(safeAvatarUrl(v, sb)).toBeUndefined();
  });
});
