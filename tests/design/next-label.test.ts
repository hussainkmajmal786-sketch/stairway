import { describe, expect, it } from "vitest";
import { nextStepLabel } from "@/lib/design/next-label";

describe("nextStepLabel", () => {
  const label = nextStepLabel({ step: 4, title: "Seeing Machines", start: "2026-11-14T10:00:00+05:30" });
  it("separates the step number, title and date with comma + space", () => {
    expect(label).toMatch(/^Next: Step 04, Seeing Machines, \d{1,2} \w+$/);
  });
  it("contains the visible 'Step 04' text (label in name)", () => {
    expect(label).toContain("Step 04");
  });
});
