/* eslint-disable react/no-children-prop -- .ts render tests (no JSX) pass the required `children` prop through createElement props */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldBand, Frame, LogoRow } from "@/components/ui/Poster";
import { StairMark, StairText, StairWordmark, Wordmark } from "@/components/ui/Logo";
import { FRAME_ORG } from "@/lib/design/brand";
import { TOKENS } from "@/lib/design/tokens";

const r = (el: ReactElement) => renderToStaticMarkup(el);
/** What a screen reader gets: drop aria-hidden subtrees (no nesting inside them in these components), then tags. */
const spoken = (html: string) =>
  html
    .replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>[^<]*<\/\1>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();

describe("StairWordmark", () => {
  const out = r(createElement(StairWordmark, { id: "hero-title" }));
  it("gives screen readers one clean word", () => {
    expect(out).toMatch(/^<h1 id="hero-title" class="stair">/);
    expect(out).toContain('<span class="sr-only">st(AI)rway</span>');
    expect(out.match(/aria-hidden="true"/g)).toHaveLength(7);
    expect(spoken(out)).toBe("st(AI)rway");
  });
  it("steps each glyph by its index and puts (AI) on the yellow block", () => {
    for (let i = 0; i < 7; i++) expect(out).toContain(`--i:${i}`);
    expect(out).toMatch(/class="g ai"[^>]*>\(AI\)</);
  });
});

describe("StairText", () => {
  it("steps any glyph list under its own label", () => {
    const out = r(createElement(StairText, { glyphs: ["0", "4"], label: "Step 4 of 12", className: "stair-num" }));
    expect(out).toMatch(/^<p class="stair stair-num"><span class="sr-only">Step 4 of 12<\/span>/);
    expect(out.match(/class="g"/g)).toHaveLength(2);
    expect(spoken(out)).toBe("Step 4 of 12");
  });
});

describe("Wordmark", () => {
  it("is read once as st(AI)rway", () => {
    const out = r(createElement(Wordmark));
    expect(out).not.toContain("aria-label");
    expect(spoken(out)).toBe("st(AI)rway");
  });
});

describe("StairMark", () => {
  it("is a cobalt square with a cream stair on dark surfaces", () => {
    const out = r(createElement(StairMark, { tone: "field" }));
    expect(out).toContain(`fill="${TOKENS.field}"`);
    expect(out).toContain(`stroke="${TOKENS.paper}"`);
    expect(out).toContain(`fill="${TOKENS.yellow}"`);
    expect(out).toContain('aria-hidden="true"');
  });
  it("is a cream square with an ink stair by default", () => {
    const out = r(createElement(StairMark));
    expect(out).toContain(`fill="${TOKENS.paper}"`);
    expect(out).toContain(`stroke="${TOKENS.ink}"`);
    expect(out).not.toContain(`fill="${TOKENS.field}"`);
  });
});

describe("FieldBand", () => {
  it("is a cream-on-field section with the CLIMB ghost by default", () => {
    const out = r(createElement(FieldBand, { id: "x", labelledBy: "x-t", children: "hi" }));
    expect(out).toMatch(/^<section id="x" aria-labelledby="x-t" class="field on-field">/);
    expect(out).toContain('<div class="ghost" aria-hidden="true"><span>CLIMB CLIMB CLIMB</span>');
    expect(out).toContain('<div class="field-content">hi</div>');
  });
  it("takes a session ghost word, no ghost, other elements and corner bands", () => {
    expect(r(createElement(FieldBand, { ghost: "STEP 04", children: "x" }))).toContain("<span>STEP 04 STEP 04 STEP 04</span>");
    const out = r(createElement(FieldBand, { ghost: false, bands: "both", as: "footer", children: "x" }));
    expect(out).not.toContain("ghost");
    expect(out).toMatch(/^<footer class="field on-field">/);
    expect(out.match(/class="bands (top|bottom)" aria-hidden="true"/g)).toHaveLength(2);
  });
  it("gives a named div the region role (a generic element cannot be named), and only a named div", () => {
    expect(r(createElement(FieldBand, { as: "div", label: "Your tickets", ghost: false, children: "x" }))).toMatch(/^<div role="region" aria-label="Your tickets" class="field on-field">/);
    expect(r(createElement(FieldBand, { as: "div", labelledBy: "t", ghost: false, children: "x" }))).toMatch(/^<div role="region" aria-labelledby="t"/);
    expect(r(createElement(FieldBand, { as: "div", ghost: false, children: "x" }))).toMatch(/^<div class="field on-field">/);
    expect(r(createElement(FieldBand, { label: "Hero", ghost: false, children: "x" }))).toMatch(/^<section aria-label="Hero"/);
  });
  it("uses the deep cobalt when asked", () => {
    expect(r(createElement(FieldBand, { deep: true, ghost: false, children: "x" }))).toMatch(/^<section class="field on-field field-2">/);
  });
});

describe("Frame and LogoRow", () => {
  it("shows the branch name as text from one constant", () => {
    expect(FRAME_ORG).toBe("IEEE SB CE KIDANGOOR");
    expect(r(createElement(LogoRow))).toContain(FRAME_ORG);
    const framed = r(createElement(Frame, { children: "body" }));
    expect(framed).toMatch(/^<div class="frame"><div class="logo-row">/);
    expect(r(createElement(Frame, { logoRow: false, children: "body" }))).toBe('<div class="frame">body</div>');
  });
  it("adds no invented copy: the branch name is the only text read out", () => {
    const row = r(createElement(LogoRow));
    expect(row).not.toContain('class="lm mid"');
    expect(spoken(row)).toBe(FRAME_ORG);
    expect(r(createElement(LogoRow, { middle: "Hello" }))).toContain('<span class="lm mid">Hello</span>');
  });
  it("shows only the branch name (and the decorative diamond): no separate IEEE mark", () => {
    const row = r(createElement(LogoRow));
    expect(row).not.toContain("ieee");
    expect(row.replace(/<[^>]+>/g, "")).toBe(FRAME_ORG);
    expect(row).toContain('<span class="diamond" aria-hidden="true"></span>');
  });
});
