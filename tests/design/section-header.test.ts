import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionHeader } from "@/components/ui/SectionHeader";

const html = (p: Parameters<typeof SectionHeader>[0]) => renderToStaticMarkup(createElement(SectionHeader, p));

describe("SectionHeader", () => {
  it("draws the left poster rule by default and both rules when centred", () => {
    expect(html({ id: "a", eyebrow: "E", title: "Title" })).toContain('class="rule-h left h2"');
    expect(html({ id: "a", eyebrow: "E", title: "Title", align: "center" })).toContain('class="rule-h h2 w-full"');
  });

  it("drops the rules with rule={false} (half-width columns)", () => {
    const out = html({ id: "a", eyebrow: "E", title: "IEEE Student Branch, [[CEK.]]", tone: "field", rule: false });
    expect(out).not.toContain("rule-h");
    expect(out).toMatch(/<h2 id="a" class="h2" data-reveal="">IEEE Student Branch, <mark/);
  });
});
