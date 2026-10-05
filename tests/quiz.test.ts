import { describe, expect, it } from "vitest";
import { quizLevel } from "@/data/tracks";

describe("quizLevel", () => {
  it("maps quiz totals to a level", () => {
    expect(quizLevel(0)).toBe("Beginner");
    expect(quizLevel(3)).toBe("Beginner");
    expect(quizLevel(5)).toBe("Intermediate");
    expect(quizLevel(9)).toBe("Advanced");
  });
});
