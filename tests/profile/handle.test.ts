import { describe, expect, it } from "vitest";
import { HANDLE_RE, normalizeHandle, suggestHandle } from "@/lib/profile/handle";

describe("normalizeHandle", () => {
  it("lowercases and slugs", () => {
    expect(normalizeHandle("Ada Lovelace!")).toBe("ada-lovelace");
    expect(normalizeHandle("  --Foo__Bar--  ")).toBe("foo__bar");
  });
  it("caps at 30 characters", () => {
    expect(normalizeHandle("a".repeat(50))).toHaveLength(30);
  });
});

describe("suggestHandle", () => {
  it("prefers the name, falls back to the email local part, then 'user'", () => {
    expect(suggestHandle("Ada Lovelace", "x@y.z")).toBe("ada-lovelace");
    expect(suggestHandle("", "grace.hopper@navy.mil")).toBe("grace-hopper");
    expect(suggestHandle("!!", "")).toBe("user");
  });
  it("always produces a valid handle", () => {
    for (const [n, e] of [["Ada", "a@b.c"], ["", "q@w.e"], ["Zoë Ünal", ""], ["x", "y@z"]])
      expect(HANDLE_RE.test(suggestHandle(n, e))).toBe(true);
  });
});
