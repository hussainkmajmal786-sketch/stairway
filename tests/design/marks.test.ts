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

  it("lets the innermost pair win for nested brackets (outer brackets stay literal)", () => {
    expect(splitMarks("a [[b [[c]] d]] e")).toEqual([
      { text: "a [[b ", marked: false },
      { text: "c", marked: true },
      { text: " d]] e", marked: false },
    ]);
  });

  it("keeps a newline inside the brackets in the marked part", () => {
    expect(splitMarks("Never miss\na [[next\nstep.]]")).toEqual([
      { text: "Never miss\na ", marked: false },
      { text: "next\nstep.", marked: true },
    ]);
  });

  it("closes on the first ]] (so [[]]] marks a lone bracket and [[]] stays literal)", () => {
    expect(splitMarks("[[]]]")).toEqual([{ text: "]", marked: true }]);
    expect(splitMarks("x [[a]]] y")).toEqual([
      { text: "x ", marked: false },
      { text: "a", marked: true },
      { text: "] y", marked: false },
    ]);
  });

  it("returns nothing for an empty string", () => {
    expect(splitMarks("")).toEqual([]);
  });
});
