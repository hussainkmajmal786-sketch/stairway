import { describe, expect, it } from "vitest";
import { displayTitleClass, plainTitle } from "@/lib/design/title";

describe("plainTitle", () => {
  it("drops the [[highlight]] markers", () => {
    expect(plainTitle("Every step, [[captured.]]")).toBe("Every step, captured.");
  });
  it("leaves unmarked text and lone brackets alone", () => {
    expect(plainTitle("Seeing Machines")).toBe("Seeing Machines");
    expect(plainTitle("Arrays [i] and [[maps]]")).toBe("Arrays [i] and maps");
  });
});

describe("displayTitleClass", () => {
  it("steps the Anton size down for longer titles instead of clamping lines", () => {
    expect(displayTitleClass("Seeing Machines")).toBe("text-[clamp(2.6rem,7vw,5rem)]");
    expect(displayTitleClass("Agents that actually ship to production")).toBe("text-[clamp(2.2rem,5.4vw,3.8rem)]");
    expect(displayTitleClass("A".repeat(49))).toBe("text-[clamp(1.9rem,4.2vw,3rem)]");
  });
  it("switches size exactly at the 24/25 and 48/49 character boundaries", () => {
    expect(displayTitleClass("x".repeat(24))).toBe("text-[clamp(2.6rem,7vw,5rem)]");
    expect(displayTitleClass("x".repeat(25))).toBe("text-[clamp(2.2rem,5.4vw,3.8rem)]");
    expect(displayTitleClass("x".repeat(48))).toBe("text-[clamp(2.2rem,5.4vw,3.8rem)]");
    expect(displayTitleClass("x".repeat(49))).toBe("text-[clamp(1.9rem,4.2vw,3rem)]");
  });
  it("measures the visible text, not the markers or surrounding whitespace", () => {
    expect(displayTitleClass(`[[${"x".repeat(24)}]]`)).toBe("text-[clamp(2.6rem,7vw,5rem)]");
    expect(displayTitleClass(`  ${"x".repeat(24)}  `)).toBe("text-[clamp(2.6rem,7vw,5rem)]");
    expect(displayTitleClass("")).toBe("text-[clamp(2.6rem,7vw,5rem)]");
  });
});
