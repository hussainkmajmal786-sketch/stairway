import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { TOKENS } from "@/lib/design/tokens";

// The old "paper brutalism" hexes that no longer exist in the palette (#F4EFE6 paper is unchanged and allowed).
const OLD = ["#FFB200", "#100F0D", "#2A8CFF", "#ECE4D7", "#E2D8C8", "#FF5A5A", "#1BE349", "#C07CFF", "#FF5C38", "#0B57C9", "#6B6355", "#4F4A40", "#3A352E"];

/**
 * Hexes outside TOKENS that may appear in source, each with the only file allowed to use it. Third-party brand
 * marks must keep their official colours.
 */
const ALLOW: Record<string, string[]> = {
  "components/ui/BrandIcons.tsx": ["#EA4335", "#4285F4", "#FBBC05", "#34A853"], // Google "G" (brand guidelines)
};

const SCANNED = ["app", "components", "lib"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|svg|css)$/.test(name) ? [p] : [];
  });
}

const sources = () =>
  SCANNED.flatMap((d) => files(join(process.cwd(), d))).map((f) => ({
    file: relative(process.cwd(), f).split(sep).join("/"),
    text: readFileSync(f, "utf8").toUpperCase(),
  }));

describe("brand assets", () => {
  it("draws the favicon with the Cobalt Circuit tokens", () => {
    const svg = readFileSync(join(process.cwd(), "app/icon.svg"), "utf8").toUpperCase();
    for (const hex of [TOKENS.field, TOKENS.ink, TOKENS.paper, TOKENS.yellow]) expect(svg).toContain(hex);
  });

  it("leaves no stale palette hex in app/, components/ or lib/", () => {
    const stale = sources().flatMap(({ file, text }) => OLD.filter((hex) => text.includes(hex)).map((hex) => `${file}: ${hex}`));
    expect(stale).toEqual([]);
  });

  it("uses only token hexes, apart from the explicit allow-list", () => {
    const tokens = new Set<string>(Object.values(TOKENS));
    const stray = sources().flatMap(({ file, text }) =>
      [...new Set(text.match(/#[0-9A-F]{6}\b/g) ?? [])]
        .filter((hex) => !tokens.has(hex) && !(ALLOW[file] ?? []).includes(hex))
        .map((hex) => `${file}: ${hex}`),
    );
    expect(stray).toEqual([]);
  });
});
