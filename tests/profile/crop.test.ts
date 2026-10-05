import { describe, expect, it } from "vitest";
import { squareCropRect } from "@/lib/profile/crop";

describe("squareCropRect", () => {
  it("centre-crops landscape and portrait images", () => {
    expect(squareCropRect(1000, 600)).toEqual({ sx: 200, sy: 0, size: 600 });
    expect(squareCropRect(600, 1000)).toEqual({ sx: 0, sy: 200, size: 600 });
    expect(squareCropRect(500, 500)).toEqual({ sx: 0, sy: 0, size: 500 });
  });
  it("floors odd offsets", () => {
    expect(squareCropRect(1001, 600)).toEqual({ sx: 200, sy: 0, size: 600 });
  });
});
