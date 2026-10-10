import { describe, expect, it } from "vitest";
import { formatInr } from "@/lib/payments/money";

describe("formatInr", () => {
  it("formats paise as rupees with Indian grouping", () => {
    expect(formatInr(19900)).toBe("₹199");
    expect(formatInr(199950)).toBe("₹1,999.50");
    expect(formatInr(10000000)).toBe("₹1,00,000");
    expect(formatInr(0)).toBe("₹0");
    expect(formatInr(5)).toBe("₹0.05");
  });

  it("never prints NaN, Infinity or a negative price", () => {
    for (const v of [NaN, Infinity, -Infinity, -1, -19900, "199" as unknown as number, null as unknown as number]) {
      expect(formatInr(v)).toBe("—");
    }
  });

  it("rounds a fractional amount to whole paise", () => {
    expect(formatInr(19900.4)).toBe("₹199");
    expect(formatInr(19950.6)).toBe("₹199.51");
  });
});
