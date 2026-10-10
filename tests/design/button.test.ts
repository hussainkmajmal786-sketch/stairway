import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/Button";

const html = (p: Parameters<typeof Button>[0]) => renderToStaticMarkup(createElement(Button, p));

describe("Button", () => {
  it("renders each variant as its btn-* class", () => {
    for (const variant of ["primary", "secondary", "ghost", "ink"] as const) {
      expect(html({ variant, children: "Go" })).toContain(`class="btn btn-${variant}"`);
    }
  });

  it("defaults to primary and adds the size class", () => {
    expect(html({ children: "Go", size: "lg" })).toContain('class="btn btn-primary btn-lg"');
  });

  it("marks disabled buttons for assistive tech too", () => {
    expect(html({ children: "Go", disabled: true })).toMatch(/disabled="" aria-disabled="true"/);
  });
});
