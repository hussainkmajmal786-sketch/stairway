import { describe, expect, it } from "vitest";
import { GHOST_DEFAULT, GHOST_FINALE, ghostRows, ghostWord, padStep } from "@/lib/design/ghost";

describe("padStep", () => {
  it("zero-pads to two digits", () => {
    expect(padStep(4)).toBe("04");
    expect(padStep(12)).toBe("12");
    expect(padStep(123)).toBe("123");
  });
  it("floors and clamps junk to 00", () => {
    expect(padStep(4.6)).toBe("04");
    expect(padStep(-1)).toBe("00");
    expect(padStep(Number.NaN)).toBe("00");
    expect(padStep(Number.POSITIVE_INFINITY)).toBe("00");
  });
});

describe("ghostWord", () => {
  it("is CLIMB on the home page and general pages", () => {
    expect(GHOST_DEFAULT).toBe("CLIMB");
    expect(ghostWord({ kind: "home" })).toBe("CLIMB");
    expect(ghostWord({ kind: "general" })).toBe("CLIMB");
  });
  it("is STEP NN on session pages and SUMMIT on the finale", () => {
    expect(GHOST_FINALE).toBe("SUMMIT");
    expect(ghostWord({ kind: "session", step: 4 })).toBe("STEP 04");
    expect(ghostWord({ kind: "session", step: 12, finale: false })).toBe("STEP 12");
    expect(ghostWord({ kind: "session", step: 8, finale: true })).toBe("SUMMIT");
  });
});

describe("ghostRows", () => {
  it("repeats the word three times per row, six rows, upper-cased", () => {
    const rows = ghostRows("climb");
    expect(rows).toHaveLength(6);
    expect(new Set(rows)).toEqual(new Set(["CLIMB CLIMB CLIMB"]));
  });
  it("takes custom counts and never returns negative lengths", () => {
    expect(ghostRows("STEP 04", 2, 2)).toEqual(["STEP 04 STEP 04", "STEP 04 STEP 04"]);
    expect(ghostRows("X", -1, 3)).toEqual([]);
  });
});
