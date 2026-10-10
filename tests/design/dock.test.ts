import { describe, expect, it } from "vitest";
import { DOCK_NARROW, dockItemClass } from "@/lib/design/dock";

describe("dockItemClass", () => {
  it("marks the active item cobalt with cream text (red is only for urgency and errors)", () => {
    expect(dockItemClass(true)).toContain("bg-field text-paper");
    expect(dockItemClass(true)).not.toContain("bg-red");
  });
  it("keeps idle items on paper-2 with ink text", () => {
    expect(dockItemClass(false)).toContain("bg-paper-2 text-ink");
  });
  it("keeps 48px targets either way", () => {
    for (const on of [true, false]) expect(dockItemClass(on)).toContain("h-12 min-w-12");
  });
  it("narrows to 44px blocks (never below the 44px target) only under 360px so the dock fits 320px screens", () => {
    expect(DOCK_NARROW).toBe("max-[359px]:min-w-11 max-[359px]:px-2");
    for (const on of [true, false]) expect(dockItemClass(on)).toContain(DOCK_NARROW);
  });
});
