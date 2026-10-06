import { describe, expect, it } from "vitest";
import { formatToken } from "@/lib/tickets/token";

describe("formatToken", () => {
  it("pads to four digits after the prefix", () => expect(formatToken("RAS-05", 42)).toBe("RAS-05-0042"));
  it("works without a prefix", () => expect(formatToken("", 7)).toBe("0007"));
  it("never truncates large numbers", () => expect(formatToken("CS-01", 12345)).toBe("CS-01-12345"));
  it("drops any fractional part", () => expect(formatToken("X", 3.9)).toBe("X-0003"));
});
