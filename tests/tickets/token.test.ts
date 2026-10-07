import { describe, expect, it } from "vitest";
import { formatToken } from "@/lib/tickets/token";

describe("formatToken", () => {
  it("pads to four digits after the prefix", () => expect(formatToken("RAS-05", 42)).toBe("RAS-05-0042"));
  it("works without a prefix", () => expect(formatToken("", 7)).toBe("0007"));
  it("never truncates large numbers", () => expect(formatToken("CS-01", 12345)).toBe("CS-01-12345"));
  it("accepts zero", () => expect(formatToken("X", 0)).toBe("X-0000"));
  it("rejects fractions, negatives and non-finite numbers", () => {
    for (const bad of [3.9, -1, Number.NaN, Infinity]) expect(() => formatToken("X", bad)).toThrow(RangeError);
  });
});
