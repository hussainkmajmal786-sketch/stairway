import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Heading, MARK_FIELD, MARK_PAPER } from "@/components/ui/Heading";

const html = (p: Parameters<typeof Heading>[0]) => renderToStaticMarkup(createElement(Heading, p));

describe("Heading", () => {
  it("puts [[words]] on the yellow marker on cream", () => {
    expect(html({ text: "Pick your [[stairway.]]" })).toContain(`<mark class="${MARK_PAPER}">stairway.</mark>`);
  });

  it("turns the marker into yellow text on the field (cream on a yellow marker would fail)", () => {
    expect(html({ text: "Pick your [[stairway.]]", tone: "field" })).toContain(`<mark class="${MARK_FIELD}">stairway.</mark>`);
    expect(MARK_FIELD).toContain("text-yellow");
    expect(MARK_FIELD).toContain("bg-transparent");
  });

  it("wraps the words in one span for rule headings so word spacing survives the flex layout", () => {
    const out = html({ id: "t", text: "Pick your [[stairway.]]", rule: "left", className: "h2" });
    expect(out).toMatch(/^<h2 id="t" class="rule-h left h2" data-reveal=""><span class="min-w-0 max-w-\[20ch\]">Pick your <mark/);
  });

  it("centres both rules when asked and stays class-less without options", () => {
    expect(html({ text: "Sponsors", rule: "both", className: "h2" })).toMatch(/^<h2 class="rule-h h2"/);
    expect(html({ text: "Plain" })).toBe('<h2 data-reveal="">Plain</h2>');
  });
});

describe("marker classes", () => {
  it("clear the browser's default <mark> background so only the stroke shows", () => {
    expect(MARK_PAPER.split(" ")).toContain("bg-transparent");
    expect(MARK_PAPER).toContain("var(--yellow)");
  });
});
