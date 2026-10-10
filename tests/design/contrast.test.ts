import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "@/lib/design/contrast";

describe("contrast (WCAG 2.x)", () => {
  it("matches the reference extremes", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 10);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#1C3FD0", "#1c3fd0")).toBe(1);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#0B1026", "#F4EFE6")).toBe(contrastRatio("#F4EFE6", "#0B1026"));
  });

  it("reproduces the spec's computed ratios", () => {
    expect(contrastRatio("#0B1026", "#F4EFE6")).toBeCloseTo(16.43, 1);
    expect(contrastRatio("#F4EFE6", "#1C3FD0")).toBeCloseTo(6.86, 2);
    expect(contrastRatio("#0B1026", "#1C3FD0")).toBeCloseTo(2.39, 2);
  });

  it("accepts 3-digit hex and rejects anything else", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 10);
    expect(() => relativeLuminance("blue")).toThrow(/hex/);
  });
});
