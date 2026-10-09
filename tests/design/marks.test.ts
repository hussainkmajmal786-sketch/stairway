import { describe, expect, it } from "vitest";
import { splitMarks } from "@/lib/design/marks";

describe("splitMarks", () => {
  it("splits plain and [[marked]] parts in order", () => {
    expect(splitMarks("Pick your [[stairway.]]")).toEqual([
      { text: "Pick your ", marked: false },
      { text: "stairway.", marked: true },
    ]);
    expect(splitMarks("[[A]] and [[B]] end")).toEqual([
      { text: "A", marked: true },
      { text: " and ", marked: false },
      { text: "B", marked: true },
      { text: " end", marked: false },
    ]);
  });

  it("keeps empty or unclosed brackets as literal text", () => {
    expect(splitMarks("no [[ close")).toEqual([{ text: "no [[ close", marked: false }]);
    expect(splitMarks("empty [[]] here")).toEqual([{ text: "empty [[]] here", marked: false }]);
  });

  it("returns nothing for an empty string", () => {
    expect(splitMarks("")).toEqual([]);
  });
});
