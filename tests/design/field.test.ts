/* eslint-disable react/no-children-prop -- .ts render tests (no JSX) pass the required `children` prop through createElement props */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { StepNumber } from "@/components/ui/StepNumber";

describe("Field", () => {
  it("shows the error row (red ! square) and keeps the hint", () => {
    const out = renderToStaticMarkup(
      createElement(Field, { id: "phone", label: "Phone", error: "Enter 10 digits.", hint: "Private", required: true, children: createElement("input", { id: "phone" }) }),
    );
    expect(out).toContain('id="phone-err"');
    expect(out).toMatch(/<span aria-hidden="true"[^>]*>!<\/span>/);
    expect(out).toContain('id="phone-hint"');
    expect(out.indexOf("phone-err")).toBeLessThan(out.indexOf("phone-hint"));
  });

  it("renders only the hint when there is no error", () => {
    const out = renderToStaticMarkup(createElement(Field, { id: "phone", label: "Phone", hint: "Private", children: createElement("input", { id: "phone" }) }));
    expect(out).toContain('id="phone-hint"');
    expect(out).not.toContain("phone-err");
  });

  it("styles inputs as a white well with the cobalt focus ring and the error recipe", () => {
    for (const c of ["bg-white", "focus-visible:outline-field", "aria-[invalid=true]:border-l-8", "aria-[invalid=true]:bg-error-bg", "h-12"]) {
      expect(inputCls).toContain(c);
    }
    expect(textareaCls).toContain("min-h-28");
    expect(textareaCls).not.toContain("h-12");
  });
});

describe("StepNumber", () => {
  it("renders the padded number with three decorative bars", () => {
    const out = renderToStaticMarkup(createElement(StepNumber, { n: 4 }));
    expect(out).toContain("<b>04</b>");
    expect(out.match(/<i aria-hidden="true"><\/i>/g)).toHaveLength(3);
    expect(renderToStaticMarkup(createElement(StepNumber, { n: 4, tone: "ink" }))).toContain('class="stepnum stepnum-ink"');
  });
});
