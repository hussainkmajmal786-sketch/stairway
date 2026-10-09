import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OgFrame, ogAccent, ogTitle } from "@/lib/og";
import { ttfUrlFromCss } from "@/lib/og-font";
import { FRAME_ORG } from "@/lib/design/brand";
import { TOKENS } from "@/lib/design/tokens";

const html = (p: Parameters<typeof OgFrame>[0]) => renderToStaticMarkup(createElement(OgFrame, p));

describe("ttfUrlFromCss", () => {
  it("finds the TrueType URL in a Google Fonts css2 response", () => {
    const css = "/* latin */\n@font-face {\n  font-family: 'Anton';\n  font-style: normal;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/l/font?kit=abc&skey=1&v=v27) format('truetype');\n}\n";
    expect(ttfUrlFromCss(css)).toBe("https://fonts.gstatic.com/l/font?kit=abc&skey=1&v=v27");
  });
  it("ignores formats Satori can't read", () => {
    expect(ttfUrlFromCss("src: url(https://x.test/a.woff2) format('woff2');")).toBeNull();
    expect(ttfUrlFromCss("")).toBeNull();
  });
});

describe("OgFrame", () => {
  it("home: cobalt card with the stepped wordmark and the branch line", () => {
    const out = html({ eyebrow: "Weekend AI event series", title: null, subtitle: "Climb into AI" });
    expect(out).toContain(`background:${TOKENS.field}`);
    expect(out).toContain(FRAME_ORG);
    expect(out).toContain("(AI)");
  });

  it("names the branch only through FRAME_ORG (no separate IEEE mark)", () => {
    const out = html({ eyebrow: "x", title: null, subtitle: "" });
    expect(out.split("IEEE").length - 1).toBe(FRAME_ORG.split("IEEE").length - 1);
  });

  it("session: the title extruded as six ink copies under the cream face", () => {
    const out = html({ eyebrow: "CS · Step 04", title: "Seeing Machines", subtitle: "Computer vision" });
    expect(out.split("Seeing Machines").length - 1).toBe(7);
    expect(out).toContain(`background:${TOKENS.yellow}`);
  });

  it("escapes markup in event text", () => {
    const out = html({ eyebrow: "CS", title: "<script>x</script>", subtitle: "" });
    expect(out).not.toContain("<script>");
  });

  it("uses an orange accent for the finale", () => {
    expect(ogAccent(false)).toBe(TOKENS.yellow);
    expect(ogAccent(true)).toBe(TOKENS.orange);
  });

  it("trims long titles at a word with an ellipsis", () => {
    expect(ogTitle("Seeing Machines")).toBe("Seeing Machines");
    const t = ogTitle("word ".repeat(30));
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t.endsWith("…")).toBe(true);
    expect(t).not.toMatch(/\s…$/);
  });
});
