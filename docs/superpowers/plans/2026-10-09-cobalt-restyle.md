# Cobalt Circuit Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole st(AI)rway site from "paper brutalism" to the approved "Cobalt Circuit" poster brutalism (cobalt field, cream double frame, extruded stair-step lettering, ghost words, corner bands, print grain) without changing any behaviour, test or accessibility guarantee.

**Architecture:** Colours live in one TypeScript token table (`lib/design/tokens.ts`) that `app/globals.css` mirrors hex-for-hex (a test keeps them in sync and checks every documented text/background pair against its WCAG minimum); canvas/OG/icon code imports the table instead of hard-coding hexes. The poster signatures are plain CSS recipes copied from the designer's `mockup.html` into `app/globals.css`, exposed through three small server-safe components (`FieldBand`, `Frame`, `StairWordmark`/`StairText`) and pure helpers (`ghostWord`, `padStep`, `ruleHead`, `displayTitleClass`). Tokens and base components land first so every commit leaves a whole, working site; pages are then restyled one family at a time.

**Tech Stack:** Next.js 16.3.8 (App Router), React 19.2, Tailwind CSS 4 (`@theme inline`), `next/font/google` (Urbanist, Space Mono, Anton), `next/og` (Satori) for OG images, Vitest 5 (node environment, `renderToStaticMarkup` for component tests), OpenNext on Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-10-09-cobalt-restyle-spec.md` (§1 palette, §2 type, §3 the five signatures, §4 component changes, §5 contrast, §6 performance, §7 rollout). **Visual source of truth:** the designer's mock-up `C:\Users\AJMAL HUSSAIN K M\AppData\Local\Temp\claude\C--claudeb\c811feb5-c9f6-4138-8196-52e80dadbea1\scratchpad\restyle\mockup.html` (+ `mockup-desktop-1280.png`, `mockup-mobile-375.png`). Every CSS/SVG recipe in this plan is copied from that file; if the scratchpad is gone, the copies in this plan are authoritative. Earlier plans for conventions: `docs/superpowers/plans/2026-10-06-phase3-registration.md`. Lessons: `.superpowers/sdd/progress.md`.

## Global Constraints

- Next.js stays `16.3.8`; read `AGENTS.md` and the relevant guide in `node_modules/next/dist/docs/` before touching framework APIs (fonts: `01-app/03-api-reference/02-components/font.md`; OG: `01-app/03-api-reference/04-functions/image-response.md`). No `proxy.ts`, no `export const runtime = "edge"`, `middleware.ts` untouched.
- Code must run on Cloudflare Workers via OpenNext: no `node:fs`/`node:path` in anything imported by pages, layouts, OG routes or icons (the Next docs' `readFile` font example does **not** work on Workers). Tests may use `node:fs`.
- **No new runtime dependencies.** Fonts: exactly three families, all through `next/font/google` (self-hosted at build time): Urbanist 300–700, Space Mono 400/700, Anton 400.
- **Palette (verbatim):** field `#1C3FD0` (dominant), field-2 `#122C99`, paper `#F4EFE6`, paper-2 `#E8E1D3`, paper-3 `#DCD3C2`, ink `#0B1026`, ink-2 `#2A2F48`, ink-3 `#454A63`, ink-4 `#5A5F78`, yellow `#FFC21A` ((AI) block + primary buttons), blue (sky, intermediate) `#6CC8FF`, green `#2EDB6A`, purple `#C9A0FF`, orange `#FF7A3D`, red `#FF5C5C`, blue-ink `#1C3FD0`, green-ink `#0A7A2A`, red-ink `#C31F1F`, purple-ink `#6B2FB5`, amber-ink `#8A5A00`, error background `#FFF6F5`.
- **Ink text NEVER on cobalt** (2.39:1 fails). On the field, text is cream (`--paper`, 6.86:1) or large yellow (4.86:1); ink is decoration only (extrusion, bands, shadows, borders). Anything with ink text inside a field sits on a cream `.box`/`.box-2`/`.panel`.
- `green-ink` text only on `paper` (4.79:1), never on `paper-2` (4.21:1).
- The frame's logo row shows the **text** `IEEE SB CE KIDANGOOR` from the single constant `FRAME_ORG` in `lib/design/brand.ts` (rendered by `LogoRow` in `components/ui/Poster.tsx`), so real logo SVGs can replace it later in one place.
- Ghost word: `CLIMB` on home and general pages, `STEP NN` (zero-padded) on session/event pages, `SUMMIT` on the finale session; always `aria-hidden`, opacity ≤ .08, never over photos or forms. Chosen through `ghostWord()`; `FieldBand`'s `ghost` prop defaults to `CLIMB`.
- Light only (`color-scheme: light`, no dark mode). Motion stays calm: the only new animation is the stair lettering's one-off climb (transform/opacity only), gated by `prefers-reduced-motion: no-preference`; never animate `text-shadow`.
- Keep every a11y guarantee: skip link, `#main` focus after navigation, 3px focus ring from the `--focus` token (ink on cream, yellow on field/top bar/footer), ≥44px touch targets, `aria-*` on forms, the countdown's sr-only `role="timer"` with explicit `aria-live="polite"` minute-level text (no per-tick announcements), reduced-motion mode.
- QR codes stay **black `#000000` modules on a white `#FFFFFF` 4-module quiet zone**, never on cobalt and never under the grain overlay (cream panels inside a field sit at `z-index: 6`, above the grain at 5). No texture in ticket PNGs.
- Keep the site name exactly `st(AI)rway`; `(AI)` always sits on the yellow block with ink text.
- Every dashboard keeps its back/close button as the **first** control of the left sidebar (`DashboardShell`).
- Work on branch `restyle-cobalt` (created from `main` in Task 1, Step 1). Every task ends with `npx vitest run`, `npx tsc --noEmit` and `npx eslint .` passing with zero errors/warnings, then a commit whose message ends with a blank line and `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Commit messages in this plan are written as `git commit -m "<subject>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"` (two `-m` = subject, blank line, trailer).

## Decisions taken in this plan (do not re-open during execution)

| Topic | Decision |
|---|---|
| Home band rhythm | Field (cobalt): hero, Societies (the stairway list), Testimonials, About IEEE, footer. Ink: top bar, topic ticker. Cream (paper / paper-2 alternating): everything else. Yellow CTA band unchanged. Long reading content, forms, dashboards' work areas and tickets' info areas stay cream. |
| Footer | Cobalt field band with cream text (user: "hero + footer + a few key sections blue"). The spec's ink footer is superseded. |
| Announcement strip | Cobalt (`bg-field`) above the ink top bar (it only ever announces an open registration). |
| `.btn-ghost` | Becomes the transparent poster button (cream outline on the field). Every existing `btn-ghost` / `variant="ghost"` use becomes the new `btn-secondary` (cream fill + ink shadow, the old look) in Task 2; only the hero's "Explore the societies" uses `ghost`. |
| Focus on `.btn-ink` | Stays ink (a yellow ring around an ink button on cream would be 1.6:1). The spec's "`.btn-ink` sets yellow" is not applied. |
| `.field` overflow | `overflow: hidden; overflow: clip;` (clip keeps `position: sticky` working for the dashboard sidebar). |
| Event titles | No 2-line clamp (it would hide words). Three Anton size steps by length via `displayTitleClass()`. Only the step number is stair-stepped on event pages. |
| OG fonts | Anton + Space Mono are fetched from Google Fonts (`css2?…&text=`) at request time inside the Worker; on any failure the image falls back to the built-in font for all text (never a half-styled card). |
| Field hints | `Field` now shows the hint together with the error and `fieldDescribedBy()` returns both ids (spec §4 Forms). |
| Space Mono | `preload: false` (spec §6: preload only Urbanist + Anton). |
| Society tags | Session rows use `tag-field` for the society name; the society colour stays on the step block. |
| 404 ghost | `CLIMB` (general page, per the user's decision; the spec suggested "LOST"). |

## File Map

| Path | Responsibility |
|---|---|
| `lib/design/tokens.ts` | **New.** Colour token table (single source for TS), CSS var names, documented contrast pairs and the forbidden ink-on-field pair |
| `lib/design/contrast.ts` | **New.** WCAG relative luminance + contrast ratio |
| `lib/design/brand.ts` | **New.** `FRAME_ORG` (logo-row text) |
| `lib/design/ghost.ts` | **New.** `padStep`, `ghostWord`, `ghostRows`, `GHOST_DEFAULT` |
| `lib/design/dock.ts` | **New.** Dock item class (active = cobalt) |
| `lib/design/hero.ts` | **New.** Hero rule head ("STEP 04 OPENS SAT 17 OCT") and handles row |
| `lib/design/title.ts` | **New.** `plainTitle`, `displayTitleClass` (Anton size steps) |
| `app/globals.css` | Tokens, `@theme`, base focus ring, all component classes and poster recipes, print + reduced motion |
| `app/layout.tsx` | Anton font, Space Mono `preload: false`, `themeColor` |
| `components/ui/Logo.tsx` | `Wordmark` (Urbanist), `StairMark` (`tone`), `StairText`, `StairWordmark` |
| `components/ui/Poster.tsx` | **New.** `FieldBand`, `Frame`, `LogoRow`, `Ghost`, `Bands` |
| `components/ui/StepNumber.tsx` | **New.** Anton step number with mini extrusion and rising bars |
| `components/ui/{Button,Field,Countdown,Heading,SectionHeader,PageHero,Avatar,GalleryArt}.tsx` | Variants, form recipe, countdown cells, field-tone headings, poster page header, token fills |
| `components/layout/{TopBar,AnnouncementBar,AccountButton,Dock,Footer}.tsx` | Ink top bar, cobalt strip, cobalt active dock item, cobalt footer |
| `components/sections/*` | Hero poster, band rhythm, field sections, gallery mats |
| `components/weekend/WeekendDetail.tsx`, `app/events/[slug]/register/page.tsx`, `app/s/[society]/page.tsx` | Field headers with session ghost words |
| `components/dashboard/DashboardShell.tsx` | Cobalt chrome, cream sidebar and work panels |
| `components/tickets/{TicketCard,NextTicketCard}.tsx`, `lib/tickets/png.ts` | Cobalt ticket header, perforation, PNG colours from tokens |
| `lib/og.tsx`, `lib/og-font.ts` (new), `app/opengraph-image.tsx`, `app/events/[slug]/opengraph-image.tsx`, `app/apple-icon.tsx`, `app/icon.svg`, `app/manifest.ts` | Brand assets |
| `app/not-found.tsx`, `app/global-error.tsx` | Error pages |
| `scripts/visual-check.mjs` | **New.** Headless screenshots at 375/1280 (+ reduced motion) with an overflow report |
| `design-system/MASTER.md`, `README.md` | Docs |
| `tests/design/*.test.ts` | **New** tests; `tests/registration/form.test.ts`, `tests/tickets/view.test.ts` updated |

---

### Task 1: Tokens, fonts and the contrast guard

**Files:**
- Create: `lib/design/tokens.ts`, `lib/design/contrast.ts`, `tests/design/contrast.test.ts`, `tests/design/tokens.test.ts`
- Modify: `app/globals.css` (from line 1 through the closing `}` of `@layer base`), `app/layout.tsx:4,18-19,57`, `components/ui/Logo.tsx:6-8`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TOKENS` (readonly record of hex strings: `field, field2, paper, paper2, paper3, ink, ink2, ink3, ink4, yellow, blue, green, red, orange, purple, blueInk, purpleInk, redInk, greenInk, amberInk, errorBg, white, black`), `type TokenName = keyof typeof TOKENS`
  - `CSS_VARS: Partial<Record<TokenName, \`--${string}\`>>`, `interface ContrastPair { fg: TokenName; bg: TokenName; min: number; use: string }`, `CONTRAST_PAIRS: ContrastPair[]`, `FORBIDDEN_PAIRS: ContrastPair[]`
  - `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number`
  - CSS custom properties `--field`, `--field-2`, `--error-bg`, `--focus`, `--noise`, `--blot`; Tailwind colours `field`, `field-2`, `error-bg`; `--font-display` = Anton (`font-display` utility)

- [ ] **Step 1: Branch from an up-to-date main**

```bash
git checkout main && git pull --ff-only
git status --short   # expect: clean (the spec and this plan are already committed on main)
git checkout -b restyle-cobalt
```

- [ ] **Step 2: Write the failing contrast tests**

Create `tests/design/contrast.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "@/lib/design/contrast";

describe("contrast (WCAG 2.x)", () => {
  it("matches the reference extremes", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 10);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#1C3FD0", "#1c3fd0")).toBe(1);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#0B1026", "#F4EFE6")).toBe(contrastRatio("#F4EFE6", "#0B1026"));
  });

  it("reproduces the spec's computed ratios", () => {
    expect(contrastRatio("#0B1026", "#F4EFE6")).toBeCloseTo(16.43, 1);
    expect(contrastRatio("#F4EFE6", "#1C3FD0")).toBeCloseTo(6.86, 2);
    expect(contrastRatio("#0B1026", "#1C3FD0")).toBeCloseTo(2.39, 2);
  });

  it("accepts 3-digit hex and rejects anything else", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 10);
    expect(() => relativeLuminance("blue")).toThrow(/hex/);
  });
});
```

Create `tests/design/tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/design/contrast";
import { CONTRAST_PAIRS, CSS_VARS, FORBIDDEN_PAIRS, TOKENS, type TokenName } from "@/lib/design/tokens";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

describe("design tokens", () => {
  it("app/globals.css :root declares every token with the same hex", () => {
    const entries = Object.entries(CSS_VARS) as [TokenName, string][];
    expect(entries.length).toBeGreaterThan(15);
    for (const [name, cssVar] of entries) {
      const m = new RegExp(`${cssVar}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(root);
      expect(m?.[1]?.toLowerCase(), cssVar).toBe(TOKENS[name].toLowerCase());
    }
  });

  it.each(CONTRAST_PAIRS)("$fg on $bg ≥ $min ($use)", ({ fg, bg, min }) => {
    expect(contrastRatio(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(min);
  });

  it.each(FORBIDDEN_PAIRS)("$fg on $bg stays forbidden ($use)", ({ fg, bg }) => {
    expect(contrastRatio(TOKENS[fg], TOKENS[bg])).toBeLessThan(3);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/design`
Expected: FAIL — `Failed to resolve import "@/lib/design/contrast"` / `"@/lib/design/tokens"`.

- [ ] **Step 4: Write the contrast helper**

Create `lib/design/contrast.ts`:

```ts
/** WCAG 2.x relative luminance of a `#rgb` or `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a hex colour: ${hex}`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio (1–21), independent of argument order. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 5: Write the token table**

Create `lib/design/tokens.ts`:

```ts
/**
 * Cobalt Circuit design tokens: the single source for colours used outside CSS (ticket PNG, OG images, icons,
 * manifest, inline SVG fills). app/globals.css :root mirrors these hexes; tests/design/tokens.test.ts keeps them in
 * sync and checks every documented text/background pair against its WCAG minimum.
 */
export const TOKENS = {
  field: "#1C3FD0",
  field2: "#122C99",
  paper: "#F4EFE6",
  paper2: "#E8E1D3",
  paper3: "#DCD3C2",
  ink: "#0B1026",
  ink2: "#2A2F48",
  ink3: "#454A63",
  ink4: "#5A5F78",
  yellow: "#FFC21A",
  blue: "#6CC8FF",
  green: "#2EDB6A",
  red: "#FF5C5C",
  orange: "#FF7A3D",
  purple: "#C9A0FF",
  blueInk: "#1C3FD0",
  purpleInk: "#6B2FB5",
  redInk: "#C31F1F",
  greenInk: "#0A7A2A",
  amberInk: "#8A5A00",
  errorBg: "#FFF6F5",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export type TokenName = keyof typeof TOKENS;

/** The custom property in app/globals.css for each token that has one (white and black are used literally). */
export const CSS_VARS: Partial<Record<TokenName, `--${string}`>> = {
  field: "--field",
  field2: "--field-2",
  paper: "--paper",
  paper2: "--paper-2",
  paper3: "--paper-3",
  ink: "--ink",
  ink2: "--ink-2",
  ink3: "--ink-3",
  ink4: "--ink-4",
  yellow: "--yellow",
  blue: "--blue",
  green: "--green",
  red: "--red",
  orange: "--orange",
  purple: "--purple",
  blueInk: "--blue-ink",
  purpleInk: "--purple-ink",
  redInk: "--red-ink",
  greenInk: "--green-ink",
  amberInk: "--amber-ink",
  errorBg: "--error-bg",
};

export interface ContrastPair {
  fg: TokenName;
  bg: TokenName;
  min: number;
  use: string;
}

/** WCAG minimums: 4.5 normal text, 3 large text (≥24px, or ≥18.66px bold) and non-text UI (focus rings, boundaries). */
export const CONTRAST_PAIRS: ContrastPair[] = [
  { fg: "ink", bg: "paper", min: 7, use: "body text" },
  { fg: "ink2", bg: "paper", min: 4.5, use: "secondary text" },
  { fg: "ink3", bg: "paper", min: 4.5, use: "muted labels" },
  { fg: "ink3", bg: "paper2", min: 4.5, use: "muted labels on alternate bands" },
  { fg: "ink4", bg: "paper", min: 4.5, use: "faint labels" },
  { fg: "ink4", bg: "paper2", min: 4.5, use: "faint labels on alternate bands" },
  { fg: "ink4", bg: "white", min: 4.5, use: "input placeholders" },
  { fg: "ink", bg: "white", min: 7, use: "input text" },
  { fg: "ink", bg: "paper3", min: 4.5, use: "neutral chips" },
  { fg: "paper", bg: "field", min: 4.5, use: "cream text and mono captions on the field" },
  { fg: "paper", bg: "field2", min: 4.5, use: "cream text on the deep field" },
  { fg: "yellow", bg: "field", min: 3, use: "large yellow display words and the focus ring on the field" },
  { fg: "paper", bg: "ink", min: 4.5, use: "top bar and ink buttons" },
  { fg: "yellow", bg: "ink", min: 4.5, use: "countdown units and the focus ring in the top bar" },
  { fg: "ink", bg: "yellow", min: 4.5, use: "primary buttons and the (AI) block" },
  { fg: "blueInk", bg: "paper", min: 4.5, use: "links and coloured text on cream" },
  { fg: "field", bg: "paper2", min: 4.5, use: "field-coloured text on alternate bands" },
  { fg: "field", bg: "white", min: 3, use: "input focus ring" },
  { fg: "ink", bg: "green", min: 4.5, use: "beginner / climbed chips" },
  { fg: "ink", bg: "blue", min: 4.5, use: "intermediate chips" },
  { fg: "ink", bg: "purple", min: 4.5, use: "advanced chips" },
  { fg: "ink", bg: "orange", min: 4.5, use: "summit chips" },
  { fg: "ink", bg: "red", min: 4.5, use: "urgency and error chips" },
  { fg: "redInk", bg: "paper", min: 4.5, use: "error text" },
  { fg: "redInk", bg: "paper2", min: 4.5, use: "error text on alternate bands" },
  { fg: "redInk", bg: "errorBg", min: 4.5, use: "error text beside an invalid input" },
  { fg: "greenInk", bg: "paper", min: 4.5, use: "success text (cream only, never paper-2)" },
  { fg: "purpleInk", bg: "paper", min: 4.5, use: "coloured labels" },
  { fg: "amberInk", bg: "paper", min: 4.5, use: "coloured labels" },
  { fg: "black", bg: "white", min: 7, use: "QR modules on their white quiet zone" },
];

/** Pairs the design forbids for text; the test proves they really fail so nobody "fixes" the rule away. */
export const FORBIDDEN_PAIRS: ContrastPair[] = [
  { fg: "ink", bg: "field", min: 3, use: "ink type on the cobalt field (ink is decoration only there)" },
];
```

- [ ] **Step 6: Run the contrast tests**

Run: `npx vitest run tests/design/contrast.test.ts`
Expected: PASS (4 tests). `tests/design/tokens.test.ts` still FAILS on the first test (`--field` missing in `:root`).

- [ ] **Step 7: Swap the tokens in `app/globals.css`**

Replace everything from line 1 (`@import "tailwindcss";`) through the closing `}` of `@layer base { … }` (the line before `@media (prefers-reduced-motion: reduce) {` that holds `html { scroll-behavior: auto; }`) with:

```css
@import "tailwindcss";

/* ═════════════════════════════════════════════════════════════
   st(AI)rway design system — "Cobalt Circuit" poster brutalism
   A cobalt poster field for heroes and key bands, cream panels for reading,
   ink outlines, hard offset shadows, flat colour chips. Square corners.
   Hex values mirror lib/design/tokens.ts (tests/design/tokens.test.ts keeps them in sync).
   Ink text never sits on the field (2.39:1): ink is decoration there only.
   ═════════════════════════════════════════════════════════════ */

:root {
  /* poster field (cobalt) */
  --field: #1c3fd0;
  --field-2: #122c99;
  /* surfaces */
  --paper: #f4efe6;
  --paper-2: #e8e1d3;
  --paper-3: #dcd3c2;
  /* ink (text, borders, shadows): blue-black */
  --ink: #0b1026;
  --ink-2: #2a2f48;
  --ink-3: #454a63;
  --ink-4: #5a5f78; /* faint labels: 5.49 on paper, 4.83 on paper-2 */
  /* flat fills (always with ink text on top) */
  --yellow: #ffc21a;
  --blue: #6cc8ff; /* intermediate: sky, never confused with the field */
  --green: #2edb6a;
  --red: #ff5c5c;
  --orange: #ff7a3d;
  --purple: #c9a0ff;
  /* text-safe accents (AA on paper) */
  --blue-ink: #1c3fd0;
  --purple-ink: #6b2fb5;
  --red-ink: #c31f1f;
  --green-ink: #0a7a2a;
  --amber-ink: #8a5a00;
  --error-bg: #fff6f5;
  /* focus ring: ink on cream; .on-field, the top bar and the footer switch it to yellow */
  --focus: var(--ink);

  --shadow: 4px 4px 0 0 var(--ink);
  --shadow-lg: 6px 6px 0 0 var(--ink);
  --border: 2px solid var(--ink);
  --section-y: clamp(72px, 10vw, 128px);
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --dock-h: 76px;
  /* print-grain tiles for .field (inline SVG, copied from the mock-up) */
  --noise: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  --blot: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Cfilter id='b'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012' numOctaves='3' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 1.25'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23b)'/%3E%3C/svg%3E");
}

@theme inline {
  --color-field: var(--field);
  --color-field-2: var(--field-2);
  --color-paper: var(--paper);
  --color-paper-2: var(--paper-2);
  --color-paper-3: var(--paper-3);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-ink-4: var(--ink-4);
  --color-yellow: var(--yellow);
  --color-blue: var(--blue);
  --color-green: var(--green);
  --color-red: var(--red);
  --color-orange: var(--orange);
  --color-purple: var(--purple);
  --color-blue-ink: var(--blue-ink);
  --color-purple-ink: var(--purple-ink);
  --color-red-ink: var(--red-ink);
  --color-green-ink: var(--green-ink);
  --color-amber-ink: var(--amber-ink);
  --color-error-bg: var(--error-bg);
  --font-sans: var(--font-urbanist), ui-sans-serif, system-ui;
  --font-display: var(--font-anton), Impact, "Arial Narrow", sans-serif;
  --font-mono: var(--font-space-mono), ui-monospace, monospace;
}

/* ───────── base ───────── */
@layer base {
  html {
    background: var(--paper);
    color-scheme: light;
    -webkit-text-size-adjust: 100%;
    scroll-behavior: smooth;
    scroll-padding-top: 88px;
  }
  body {
    background-color: var(--paper);
    /* faint graph-paper grid */
    background-image:
      linear-gradient(rgba(11, 16, 38, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(11, 16, 38, 0.05) 1px, transparent 1px);
    background-size: 32px 32px;
    color: var(--ink);
    font-family: var(--font-sans);
    font-size: 1.0625rem;
    line-height: 1.6;
    overflow-x: clip;
    -webkit-font-smoothing: antialiased;
  }
  ::selection { background: var(--yellow); color: var(--ink); }
  :focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
  h1, h2, h3, h4 { letter-spacing: -0.02em; line-height: 1.08; }
  img, svg, video, canvas { display: block; max-width: 100%; }
  /* Tailwind v4 resets buttons to cursor:default — every clickable gets a pointer */
  button:not(:disabled), [role="button"], label[for], select, summary { cursor: pointer; }
  a, button { touch-action: manipulation; }
}
```

(The `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }` block and everything after it stay as they are.)

- [ ] **Step 8: Add Anton through next/font**

In `app/layout.tsx` replace the font import and the two font constants:

```tsx
import { Anton, Space_Mono, Urbanist } from "next/font/google";
```

```tsx
const urbanist = Urbanist({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-urbanist", display: "swap" });
// Display face: hero stair lettering, section titles, countdown digits, step numbers. One weight (~20 KB latin).
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton", display: "swap" });
// Labels only, so it isn't preloaded (spec §6: preload Urbanist + Anton).
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap", preload: false });
```

and the `<html>` className:

```tsx
    <html lang="en-IN" className={`${urbanist.variable} ${anton.variable} ${spaceMono.variable}`} suppressHydrationWarning>
```

- [ ] **Step 9: Keep the wordmark in Urbanist**

`--font-display` is Anton now, so in `components/ui/Logo.tsx` change the `Wordmark` spans to:

```tsx
    <span className={cn("font-sans font-semibold tracking-[-0.04em]", className)} aria-label="st(AI)rway">
      <span aria-hidden>st</span>
      <span aria-hidden className={cn(block && "mx-[0.04em] bg-yellow px-[0.08em] text-ink")}>(AI)</span>
      <span aria-hidden>rway</span>
    </span>
```

(`text-ink` keeps the (AI) block ink when the wordmark sits on the ink top bar or the cobalt footer later.)

- [ ] **Step 10: Run the full checks and a production build**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS (the new design tests included).

Run: `npm run build`
Expected: build succeeds; `ls .next/static/media | wc -l` shows more font files than before (Anton added). If the build machine has no network, `next/font/google` fails here exactly as it would for Urbanist today — retry with network; do not switch to a CDN `<link>`.

- [ ] **Step 11: Commit**

```bash
git add lib/design/tokens.ts lib/design/contrast.ts tests/design/contrast.test.ts tests/design/tokens.test.ts app/globals.css app/layout.tsx components/ui/Logo.tsx
git commit -m "feat(design): Cobalt Circuit tokens, Anton display font and a contrast guard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Component CSS, button variants and the poster recipes

**Files:**
- Create: `tests/design/css-contract.test.ts`, `tests/design/button.test.ts`
- Modify: `app/globals.css` (from `@layer components {` to the end of the file), `components/ui/Button.tsx:12`, every file under `app/` and `components/` containing `btn-ghost` or `variant="ghost"` (sweep)

**Interfaces:**
- Consumes: tokens and `--focus` from Task 1.
- Produces (CSS classes later tasks use): `.h-display`, `.h2` (Anton), `.mono-wide`, `.tagline`, `.presents`, `.rule-h` (+ `.left`), `.soon`, `.panel`, `.field`, `.field-2`, `.field-content`, `.on-field`, `.ghost`, `.bands.top`/`.bands.bottom`, `.frame`, `.logo-row` (+ `.lm`, `.mid`, `.ieee`, `.diamond`), `.stair` (+ `.g`, `.ai`), `.extrude`, `.stair-cap`, `.stair-num`, `.stepnum` (+ `.stepnum-ink`, `--stepnum-size`), `.btn-secondary`, `.btn-ghost` (transparent), `.tag-field`, `.tag-cream`, `.topbar`, `.ticket-h`, `.perf`, `.side-strip`; `Button` `variant: "primary" | "secondary" | "ghost" | "ink"`.

- [ ] **Step 1: Write the failing CSS contract and Button tests**

Create `tests/design/css-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

describe("globals.css contract", () => {
  it.each([
    ".field::before", ".field::after", ".field-content", ".on-field", ".ghost", ".bands.top", ".bands.bottom",
    ".frame", ".logo-row", ".stair .g", ".stair .ai", ".extrude", ".stair-num", ".rule-h", ".btn-secondary",
    ".btn-ghost", ".tag-field", ".tag-cream", ".stepnum", ".ticket-h", ".perf", ".panel", ".topbar .btn", ".side-strip",
  ])("defines %s", (selector) => {
    expect(css).toContain(selector);
  });

  it("declares --extrude on the stair/extrude rule, never on :root (var(--ink) resolves where it is declared)", () => {
    expect(root).not.toContain("--extrude");
    expect(css).toMatch(/\.stair,\s*\.extrude\s*\{[^}]*--extrude:/);
  });

  it("draws every focus ring from the --focus token and turns it yellow on the field", () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid var\(--focus\)/);
    expect(css).toMatch(/\.on-field\s*\{[^}]*--focus:\s*var\(--yellow\)/);
  });

  it("marks disabled buttons with a dashed border, not opacity", () => {
    const rule = /\.btn:disabled,\s*\.btn\[aria-disabled="true"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("border-style: dashed");
    expect(rule).not.toContain("opacity");
  });

  it("only animates the stair lettering when motion is welcome", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.stair \.g\s*\{\s*animation:/);
  });

  it("keeps print free of the field, its grain and the ghost word", () => {
    expect(css).toMatch(/@media print\s*\{[\s\S]*\.field::before, \.field::after, \.ghost, \.bands/);
  });
});
```

Create `tests/design/button.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/design/css-contract.test.ts tests/design/button.test.ts`
Expected: FAIL — missing selectors (`.field::before` …) and a TypeScript/variant failure for `"secondary"` (rendered class is `btn btn-secondary` already, so the Button test may pass at runtime; `npx tsc --noEmit` fails on `variant: "secondary"` until Step 4).

- [ ] **Step 3: Replace the component layer of `app/globals.css`**

Replace everything from the line `/* z-index scale: 40 header · 50 dock · 60 modal · 70 toast */` to the end of the file with:

```css
/* z-index scale: 40 header · 50 dock · 60 modal · 70 toast · 80 skip link
   inside a .field: 0 ghost word · 1 corner bands · 2 content · 5 print grain · 6 cream panels */

@layer components {
  /* ───────── layout ───────── */
  .wrap { width: 100%; max-width: 1200px; margin-inline: auto; padding-inline: clamp(16px, 4vw, 40px); }
  .section { position: relative; padding-block: var(--section-y); }
  .section-alt { background: var(--paper-2); border-block: var(--border); }
  .rule { border-top: var(--border); }

  /* ───────── type ───────── */
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .mono { font-family: var(--font-mono); letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.75rem; }
  .mono-wide { font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; font-size: 0.7rem; }
  /* removed in Task 6 together with .blur-in, once the hero uses the stair lettering */
  .h-hero { font-size: clamp(3.4rem, 15vw, 10rem); font-weight: 500; letter-spacing: -0.045em; line-height: 0.95; }
  .h-display { font-family: var(--font-display); font-weight: 400; text-transform: uppercase; letter-spacing: 0.01em; line-height: 0.95; }
  .h2 { font-family: var(--font-display); font-weight: 400; font-size: clamp(2.6rem, 7vw, 5rem); text-transform: uppercase; letter-spacing: 0.01em; line-height: 0.95; }
  .h3 { font-size: clamp(1.4rem, 2.4vw, 1.9rem); font-weight: 600; }
  .lead { color: var(--ink-3); font-size: clamp(1.1rem, 1.6vw, 1.35rem); line-height: 1.55; max-width: 58ch; }
  .tagline { font-size: clamp(1.15rem, 2.2vw, 1.55rem); font-weight: 400; line-height: 1.4; max-width: 46ch; }
  .presents { line-height: 1.35; }
  .presents b { display: block; font-family: var(--font-mono); font-size: clamp(0.78rem, 1.4vw, 1rem); letter-spacing: 0.08em; text-transform: uppercase; }
  .presents small { font-family: var(--font-mono); font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; }
  /* poster rule heading ("COMING SOON"): lead rule · text · flexible trailing rule */
  .rule-h { display: flex; align-items: center; gap: clamp(10px, 2vw, 22px); }
  .rule-h::before, .rule-h::after { content: ""; flex: 1 1 12px; min-width: 12px; height: 3px; background: currentColor; }
  .rule-h.left::before { flex: 0 0 28px; }
  .soon { font-family: var(--font-display); font-weight: 400; text-transform: uppercase; line-height: 0.95; letter-spacing: 0.01em; white-space: nowrap; font-size: clamp(1.3rem, 6.4vw, 3.4rem); }

  /* ───────── surfaces ───────── */
  .box { background: var(--paper); border: var(--border); }
  .box-2 { background: var(--paper-2); border: var(--border); }
  .panel { background: var(--paper); color: var(--ink); border: var(--border); box-shadow: var(--shadow-lg); --focus: var(--ink); }
  .shadow-hard { box-shadow: var(--shadow); }
  .lift { transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease); }
  .lift:hover { transform: translate(-2px, -2px); box-shadow: var(--shadow-lg); }
  .lift:active { transform: translate(2px, 2px); box-shadow: 0 0 0 0 var(--ink); }

  /* ───────── signature 1 · cobalt field + print grain ───────── */
  .field { position: relative; isolation: isolate; background-color: var(--field); overflow: hidden; overflow: clip; }
  .field-2 { background-color: var(--field-2); }
  .field::before, .field::after { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 5; mix-blend-mode: soft-light; }
  .field::before { background-image: var(--noise); opacity: 0.32; }
  .field::after { background-image: var(--blot); background-size: 600px; opacity: 0.14; }
  .field-content { position: relative; z-index: 2; }
  /* cream panels sit above the grain so forms, tables and QR codes stay perfectly clean */
  .field :is(.box, .box-2, .panel) { position: relative; z-index: 6; }
  /* text on the field is cream; focus turns yellow (4.86:1 on cobalt) */
  .on-field { --focus: var(--yellow); color: var(--paper); }
  .on-field :is(.eyebrow, .lead) { color: var(--paper); }
  .on-field .tag-outline { color: var(--paper); border-color: var(--paper); }
  .on-field :is(.box, .box-2, .panel) { color: var(--ink); --focus: var(--ink); }
  .on-field :is(.box, .box-2, .panel) :is(.eyebrow, .lead) { color: var(--ink-3); }
  .on-field :is(.box, .box-2, .panel) .tag-outline { color: var(--ink); border-color: var(--ink); }

  /* ───────── signature 2 · ghost word ───────── */
  .ghost {
    position: absolute; inset: -12% -25% auto; z-index: 0; transform: rotate(-7deg); pointer-events: none; user-select: none;
    font-family: var(--font-display); text-transform: uppercase; font-size: clamp(5rem, 15vw, 13rem); line-height: 0.86;
    color: var(--paper); opacity: 0.075; white-space: nowrap;
  }
  .ghost span { display: block; }
  .ghost span:nth-child(even) { margin-left: -0.6em; opacity: 0.7; }

  /* ───────── signature 3 · diagonal corner bands ───────── */
  .bands { position: absolute; left: 0; right: 0; height: clamp(44px, 9vw, 120px); z-index: 1; pointer-events: none; }
  .bands.top { top: 0; background: linear-gradient(176deg, var(--paper) 0 30%, var(--ink) calc(30% + 0.5px) 62%, transparent calc(62% + 0.5px)); }
  .bands.bottom { bottom: 0; background: linear-gradient(176deg, transparent 0 38%, var(--ink) calc(38% + 0.5px) 70%, var(--paper) calc(70% + 0.5px)); }

  /* ───────── signature 4 · double frame + logo row ───────── */
  .frame {
    position: relative; z-index: 2; border: 6px solid var(--paper); outline: 2px solid var(--paper); outline-offset: -14px;
    padding: clamp(22px, 3.4vw, 44px) clamp(20px, 3.4vw, 48px);
  }
  .logo-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 2px solid rgba(244, 239, 230, 0.35); }
  .logo-row .lm { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; line-height: 1.2; }
  .logo-row .ieee { font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; letter-spacing: 0.06em; line-height: 1; }
  .diamond { width: 22px; height: 22px; flex: none; border: 2px solid var(--paper); transform: rotate(45deg); display: grid; place-items: center; }
  .diamond::after { content: ""; width: 8px; height: 8px; background: var(--paper); }
  @media (max-width: 480px) {
    .frame { border-width: 5px; outline-offset: -11px; }
    .logo-row .mid { display: none; }
  }

  /* ───────── signature 5 · extruded stair-step lettering ───────── */
  /* --extrude lives here, not on :root: a custom property resolves var(--ink) where it is declared */
  .stair, .extrude {
    --x: var(--ink);
    --extrude: 0.012em -0.012em 0 var(--x), 0.024em -0.024em 0 var(--x), 0.036em -0.036em 0 var(--x), 0.048em -0.048em 0 var(--x),
      0.06em -0.06em 0 var(--x), 0.072em -0.072em 0 var(--x), 0.084em -0.084em 0 var(--x), 0.096em -0.096em 0 var(--x),
      0.108em -0.108em 0 var(--x), 0.12em -0.12em 0 var(--x);
  }
  .extrude { text-shadow: var(--extrude); }
  .stair {
    --step: 0.1em;
    font-family: var(--font-display); font-weight: 400; line-height: 0.9; letter-spacing: 0.005em;
    font-size: clamp(3.4rem, 16.5vw, 11.5rem); color: var(--paper);
    display: flex; align-items: flex-end; padding-top: calc(var(--step) * 6 + 0.14em);
  }
  .stair .g { display: inline-block; text-shadow: var(--extrude); transform: translateY(calc(var(--i) * var(--step) * -1)); }
  .stair .ai {
    background: var(--yellow); color: var(--ink); padding: 0.02em 0.07em 0; margin: 0 0.04em 0 0.03em; text-shadow: none;
    box-shadow: 0.03em -0.03em 0 var(--x), 0.06em -0.06em 0 var(--x), 0.09em -0.09em 0 var(--x), 0.12em -0.12em 0 var(--x);
  }
  .stair-cap { white-space: nowrap; font-size: clamp(0.56rem, 2.5vw, 0.78rem); letter-spacing: clamp(0.16em, 0.6vw, 0.3em); margin-top: 0.9rem; transform: rotate(-5deg); transform-origin: 0 50%; }
  /* two-digit step number on a cream panel (event header): cobalt face, ink extrusion */
  .stair-num { --step: 0.12em; font-size: clamp(3.6rem, 9vw, 5.4rem); color: var(--field); padding-top: calc(var(--step) + 0.14em); }
  @media (prefers-reduced-motion: no-preference) {
    .stair .g { animation: climb 0.7s var(--ease) both; animation-delay: calc(0.08s + var(--i) * 70ms); }
  }
  @keyframes climb {
    from { opacity: 0; transform: translateY(0.35em); }
    to { opacity: 1; transform: translateY(calc(var(--i) * var(--step) * -1)); }
  }

  /* card step number: Anton in cobalt with a mini extrusion and three rising ink bars */
  .stepnum { --stepnum-size: 4.6rem; display: inline-flex; align-items: flex-end; gap: 3px; }
  .stepnum i { display: block; width: calc(var(--stepnum-size) * 0.16); background: var(--ink); }
  .stepnum i:nth-child(1) { height: calc(var(--stepnum-size) * 0.25); }
  .stepnum i:nth-child(2) { height: calc(var(--stepnum-size) * 0.42); }
  .stepnum i:nth-child(3) { height: calc(var(--stepnum-size) * 0.58); }
  .stepnum b { margin-left: 6px; font-family: var(--font-display); font-weight: 400; font-size: var(--stepnum-size); line-height: 0.8; color: var(--field); text-shadow: 0.04em -0.04em 0 var(--ink); }
  .stepnum-ink b { color: var(--ink); text-shadow: none; }

  /* ───────── buttons ───────── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    min-height: 50px;
    padding: 0 1.4rem;
    border: var(--border);
    box-shadow: var(--shadow);
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.8rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    white-space: nowrap;
    transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease), background 0.15s;
  }
  .btn:hover { transform: translate(-2px, -2px); box-shadow: var(--shadow-lg); }
  .btn:active { transform: translate(3px, 3px); box-shadow: 0 0 0 0 var(--ink); }
  .btn-primary { background: var(--yellow); }
  .btn-secondary { background: var(--paper); }
  .btn-ghost { background: transparent; box-shadow: none; }
  .btn-ghost:hover { transform: none; box-shadow: none; background: rgba(11, 16, 38, 0.06); }
  .on-field .btn-ghost { color: var(--paper); border-color: var(--paper); }
  .on-field .btn-ghost:hover { background: rgba(244, 239, 230, 0.1); }
  .btn-ink { background: var(--ink); color: var(--paper); box-shadow: 4px 4px 0 0 var(--yellow); }
  .btn-ink:hover { box-shadow: 6px 6px 0 0 var(--yellow); }
  .btn-sm { min-height: 44px; padding: 0 1rem; font-size: 0.72rem; }
  .btn-lg { min-height: 58px; padding: 0 1.8rem; font-size: 0.86rem; }
  /* disabled: dashed border + paper-3 fill (opacity .5 failed contrast on the field) */
  .btn:disabled, .btn[aria-disabled="true"] { background: var(--paper-3); color: var(--ink-4); border-style: dashed; box-shadow: none; transform: none; pointer-events: none; }
  .on-field .btn:disabled, .on-field .btn[aria-disabled="true"] { background: transparent; color: rgba(244, 239, 230, 0.75); border-color: rgba(244, 239, 230, 0.75); }

  /* ───────── top bar (ink) ───────── */
  .topbar { --focus: var(--yellow); }
  .topbar .btn { border-color: var(--paper); box-shadow: 3px 3px 0 0 var(--yellow); }
  .topbar .btn:hover { box-shadow: 5px 5px 0 0 var(--yellow); }
  .topbar .btn-primary { box-shadow: 3px 3px 0 0 var(--paper); }
  .topbar .btn-primary:hover { box-shadow: 5px 5px 0 0 var(--paper); }

  /* ───────── tags (flat colour chips, always with an ink border and a word) ───────── */
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.26rem 0.55rem;
    border: 2px solid var(--ink);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    line-height: 1.3;
    text-transform: uppercase;
    color: var(--ink);
    background: var(--paper-3);
    white-space: nowrap;
  }
  .tag-yellow { background: var(--yellow); }
  .tag-blue { background: var(--blue); }
  .tag-green { background: var(--green); }
  .tag-red { background: var(--red); }
  .tag-orange { background: var(--orange); }
  .tag-purple { background: var(--purple); }
  .tag-ink { background: var(--ink); color: var(--paper); }
  .tag-cream { background: var(--paper); }
  .tag-field { background: var(--field); color: var(--paper); }
  .tag-outline { background: transparent; border-style: dashed; }

  /* label with coloured icon: WHEN / WHERE / CLOSES */
  .meta-label { font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; display: inline-flex; align-items: center; gap: 0.4rem; }

  /* filter chips */
  .chip-btn {
    min-height: 44px;
    padding: 0 1rem;
    border: var(--border);
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    transition: background 0.15s, color 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .chip-btn:hover { background: var(--paper-3); }
  .chip-btn[aria-pressed="true"], .chip-btn[aria-selected="true"] { background: var(--ink); color: var(--paper); box-shadow: 3px 3px 0 0 var(--yellow); }

  /* ───────── seats bar ───────── */
  .seats-track { height: 14px; border: var(--border); background: var(--paper); overflow: hidden; }
  .seats-fill {
    height: 100%; transform-origin: left; background-color: var(--field);
    background-image: repeating-linear-gradient(-45deg, transparent 0 6px, rgba(244, 239, 230, 0.18) 6px 9px);
  }
  .seats-fill[data-tone="low"] { background-color: var(--red); background-image: none; border-right: var(--border); }

  /* status square that blinks for "next up" */
  .blink { width: 9px; height: 9px; background: currentColor; animation: blink 1.2s steps(2, start) infinite; }
  @keyframes blink { to { visibility: hidden; } }

  /* ───────── tickets ───────── */
  .ticket-h {
    position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 12px 20px; background: var(--field); color: var(--paper); border-bottom: var(--border);
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .ticket-h::after { content: ""; position: absolute; right: -6px; top: 0; bottom: 0; width: 90px; background: linear-gradient(110deg, transparent 0 40%, var(--ink) 40% 60%, var(--paper) 60% 70%, transparent 70%); }
  .perf { position: relative; height: 0; margin: 0 20px; border-top: 2px dashed var(--ink); }
  .perf::before, .perf::after { content: ""; position: absolute; top: -12px; width: 22px; height: 22px; border: var(--border); background: var(--paper); border-radius: 50%; }
  .perf::before { left: -34px; clip-path: inset(0 0 0 50%); }
  .perf::after { right: -34px; clip-path: inset(0 50% 0 0); }

  /* ───────── dashboard ───────── */
  .side-strip { height: 10px; background: var(--field); border: var(--border); }

  /* ───────── marquee ───────── */
  .marquee { display: flex; overflow: hidden; user-select: none; }
  .marquee-track { display: flex; flex-shrink: 0; min-width: 100%; gap: 1rem; padding-right: 1rem; animation: marquee var(--speed, 50s) linear infinite; }
  .marquee:hover .marquee-track { animation-play-state: paused; }
  @keyframes marquee { to { transform: translateX(-100%); } }

  /* ───────── reveals (subtle: fade + small rise, once) ───────── */
  .js [data-reveal] { opacity: 0; transform: translateY(16px); }
  .js [data-reveal].is-in { opacity: 1; transform: none; transition: opacity 0.5s var(--ease), transform 0.5s var(--ease); transition-delay: calc(var(--d, 0) * 50ms); }
  .js [data-reveal].is-in:hover { transition-delay: 0s; }
  /* revealed cards keep their snappy hover lift */
  .js [data-reveal].is-in.lift { transition: opacity 0.5s var(--ease), transform 0.15s var(--ease), box-shadow 0.15s var(--ease); }

  /* hero wordmark: blur → sharp (removed in Task 6) */
  .blur-in { animation: blur-in 1.1s var(--ease) both; }
  @keyframes blur-in { from { filter: blur(16px); opacity: 0; } to { filter: blur(0); opacity: 1; } }
  .fade-up { animation: fade-up 0.6s var(--ease) both; animation-delay: calc(0.25s + var(--d, 0) * 70ms); }
  @keyframes fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @keyframes roll { from { transform: translateY(100%); } to { transform: none; } }
  @keyframes pop { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  /* ───────── utilities ───────── */
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .skip-link {
    position: fixed; top: 12px; left: 12px; z-index: 80;
    padding: 0.75rem 1.1rem; border: var(--border); background: var(--yellow); color: var(--ink);
    font-family: var(--font-mono); font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.8rem;
    transform: translateY(-200%); transition: transform 0.15s;
  }
  .skip-link:focus { transform: none; }
  .no-scrollbar { scrollbar-width: none; }
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .tabular { font-variant-numeric: tabular-nums; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
  .marquee-track { animation: none !important; }
  .js [data-reveal] { opacity: 1; transform: none; }
  .stair .g { animation: none !important; }
}

@media print {
  .field { background: none !important; }
  .field::before, .field::after, .ghost, .bands { display: none !important; }
  .on-field, .on-field .stair { color: var(--ink) !important; }
  nav[aria-label="Primary"], .skip-link { display: none !important; }
}
```

- [ ] **Step 4: Add the `secondary` variant to `Button`**

In `components/ui/Button.tsx` change the variant line of `Props`:

```tsx
  variant?: "primary" | "secondary" | "ghost" | "ink";
```

- [ ] **Step 5: Sweep the old ghost buttons to `secondary`**

`.btn-ghost` is now transparent with no shadow (the poster button for the field). Every existing use was the old cream/shadow secondary button:

```bash
git grep -l -E 'btn-ghost|variant="ghost"' -- app components | xargs sed -i -E 's/btn-ghost/btn-secondary/g; s/variant="ghost"/variant="secondary"/g'
git grep -n -E 'btn-ghost|variant="ghost"' -- app components
```

Expected: the second command prints nothing. (Task 6 re-introduces `variant="ghost"` for the hero's "Explore the societies" only.)

- [ ] **Step 6: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -u
git add tests/design/css-contract.test.ts tests/design/button.test.ts
git commit -m "feat(design): poster component layer, secondary/ghost buttons, dashed disabled state" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Poster primitives (ghost, bands, frame, field band, stair lettering)

**Files:**
- Create: `lib/design/brand.ts`, `lib/design/ghost.ts`, `components/ui/Poster.tsx`, `tests/design/ghost.test.ts`, `tests/design/poster.test.ts`
- Modify: `components/ui/Logo.tsx` (whole file)

**Interfaces:**
- Consumes: `TOKENS` (Task 1), CSS classes (Task 2).
- Produces:
  - `FRAME_ORG = "IEEE SB CE KIDANGOOR"` (`lib/design/brand.ts`)
  - `padStep(n: number): string`, `GHOST_DEFAULT = "CLIMB"`, `type GhostContext = { kind: "home" | "general" } | { kind: "session"; step: number; finale?: boolean }`, `ghostWord(ctx: GhostContext): string`, `ghostRows(word: string, rows?: number, perRow?: number): string[]`
  - `Ghost({ word, className? })`, `Bands({ edge: "top" | "bottom" })`, `LogoRow({ org?, middle? })`, `Frame({ children, logoRow?, className? })`, `FieldBand(props: FieldBandProps)` with `FieldBandProps = { as?: "section" | "header" | "footer" | "div"; id?; labelledBy?; label?; ghost?: string | false; bands?: "none" | "top" | "both"; deep?: boolean; className?; innerClassName?; children }`
  - `Wordmark({ className?, block? })`, `StairMark({ size?, className?, tone?: "paper" | "field" })`, `WORDMARK_GLYPHS`, `StairText({ glyphs: readonly string[]; label: string; as?: "h1" | "h2" | "p" | "span"; id?; className? })`, `StairWordmark({ id?, as?, className? })`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/design/ghost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GHOST_DEFAULT, ghostRows, ghostWord, padStep } from "@/lib/design/ghost";

describe("padStep", () => {
  it("zero-pads to two digits", () => {
    expect(padStep(4)).toBe("04");
    expect(padStep(12)).toBe("12");
    expect(padStep(123)).toBe("123");
  });
  it("floors and clamps junk to 00", () => {
    expect(padStep(4.6)).toBe("04");
    expect(padStep(-1)).toBe("00");
    expect(padStep(Number.NaN)).toBe("00");
  });
});

describe("ghostWord", () => {
  it("is CLIMB on the home page and general pages", () => {
    expect(GHOST_DEFAULT).toBe("CLIMB");
    expect(ghostWord({ kind: "home" })).toBe("CLIMB");
    expect(ghostWord({ kind: "general" })).toBe("CLIMB");
  });
  it("is STEP NN on session pages and SUMMIT on the finale", () => {
    expect(ghostWord({ kind: "session", step: 4 })).toBe("STEP 04");
    expect(ghostWord({ kind: "session", step: 12, finale: false })).toBe("STEP 12");
    expect(ghostWord({ kind: "session", step: 8, finale: true })).toBe("SUMMIT");
  });
});

describe("ghostRows", () => {
  it("repeats the word three times per row, six rows, upper-cased", () => {
    const rows = ghostRows("climb");
    expect(rows).toHaveLength(6);
    expect(new Set(rows)).toEqual(new Set(["CLIMB CLIMB CLIMB"]));
  });
  it("takes custom counts and never returns negative lengths", () => {
    expect(ghostRows("STEP 04", 2, 2)).toEqual(["STEP 04 STEP 04", "STEP 04 STEP 04"]);
    expect(ghostRows("X", -1, 3)).toEqual([]);
  });
});
```

Create `tests/design/poster.test.ts`:

```ts
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldBand, Frame, LogoRow } from "@/components/ui/Poster";
import { StairMark, StairText, StairWordmark } from "@/components/ui/Logo";
import { FRAME_ORG } from "@/lib/design/brand";
import { TOKENS } from "@/lib/design/tokens";

const r = (el: ReactElement) => renderToStaticMarkup(el);

describe("StairWordmark", () => {
  const out = r(createElement(StairWordmark, { id: "hero-title" }));
  it("gives screen readers one clean word", () => {
    expect(out).toMatch(/^<h1 id="hero-title" class="stair">/);
    expect(out).toContain('<span class="sr-only">st(AI)rway</span>');
    expect(out.match(/aria-hidden="true"/g)).toHaveLength(7);
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
  });
});

describe("StairMark", () => {
  it("is a cobalt square with a cream stair on dark surfaces", () => {
    const out = r(createElement(StairMark, { tone: "field" }));
    expect(out).toContain(`fill="${TOKENS.field}"`);
    expect(out).toContain(`stroke="${TOKENS.paper}"`);
    expect(out).toContain(`fill="${TOKENS.yellow}"`);
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
});

describe("Frame and LogoRow", () => {
  it("shows the branch name as text from one constant", () => {
    expect(FRAME_ORG).toBe("IEEE SB CE KIDANGOOR");
    expect(r(createElement(LogoRow))).toContain(FRAME_ORG);
    const framed = r(createElement(Frame, { children: "body" }));
    expect(framed).toMatch(/^<div class="frame"><div class="logo-row">/);
    expect(r(createElement(Frame, { logoRow: false, children: "body" }))).toBe('<div class="frame">body</div>');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/design/ghost.test.ts tests/design/poster.test.ts`
Expected: FAIL — unresolved imports `@/lib/design/ghost`, `@/components/ui/Poster`, `@/lib/design/brand`.

- [ ] **Step 3: Write the brand constant and ghost helpers**

Create `lib/design/brand.ts`:

```ts
/**
 * Text shown in the poster frame's logo row (and the OG images). There are no official logo files yet: when the
 * branch supplies IEEE SB CEK / IEEE cream logo SVGs, replace LogoRow's body in components/ui/Poster.tsx (and the
 * OG frame's top row in lib/og.tsx) and keep this constant as their accessible name.
 */
export const FRAME_ORG = "IEEE SB CE KIDANGOOR";
```

Create `lib/design/ghost.ts`:

```ts
/** Zero-padded step number ("04"); junk (negative, NaN) becomes "00". */
export function padStep(n: number): string {
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return String(v).padStart(2, "0");
}

/** The ghost word on home and general pages. */
export const GHOST_DEFAULT = "CLIMB";

export type GhostContext = { kind: "home" | "general" } | { kind: "session"; step: number; finale?: boolean };

/** Background word for a page: CLIMB (home/general), STEP NN (sessions), SUMMIT (the finale). */
export function ghostWord(ctx: GhostContext): string {
  if (ctx.kind === "session") return ctx.finale ? "SUMMIT" : `STEP ${padStep(ctx.step)}`;
  return GHOST_DEFAULT;
}

/** Rows of the repeated word for the rotated ghost block (every other row is offset in CSS). */
export function ghostRows(word: string, rows = 6, perRow = 3): string[] {
  const line = Array.from({ length: Math.max(0, perRow) }, () => word.toUpperCase()).join(" ");
  return Array.from({ length: Math.max(0, rows) }, () => line);
}
```

- [ ] **Step 4: Write the poster components**

Create `components/ui/Poster.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FRAME_ORG } from "@/lib/design/brand";
import { GHOST_DEFAULT, ghostRows } from "@/lib/design/ghost";

/** Huge rotated background word (CLIMB, STEP 04, SUMMIT). Decorative: never read, never over photos or forms. */
export function Ghost({ word, className }: { word: string; className?: string }) {
  return (
    <div className={cn("ghost", className)} aria-hidden="true">
      {ghostRows(word).map((row, i) => (
        <span key={i}>{row}</span>
      ))}
    </div>
  );
}

/** Diagonal paper/ink corner band along the top or bottom edge of a field. Decorative. */
export function Bands({ edge }: { edge: "top" | "bottom" }) {
  return <div className={`bands ${edge}`} aria-hidden="true" />;
}

/**
 * The frame's logo row. Text for now (no logo files yet): when the branch supplies cream IEEE SB CEK / IEEE logo
 * SVGs, swap this body for them and keep FRAME_ORG as their accessible name.
 */
export function LogoRow({ org = FRAME_ORG, middle }: { org?: string; middle?: string }) {
  return (
    <div className="logo-row">
      <span className="lm">
        <span className="diamond" aria-hidden="true" />
        {org}
      </span>
      <span className="lm mid" aria-hidden="true">{middle}</span>
      <span className="lm ieee" aria-hidden="true">IEEE</span>
    </div>
  );
}

/** Cream double frame (6px border + inset 2px outline) with the logo row on top. */
export function Frame({ children, logoRow = true, className }: { children: ReactNode; logoRow?: boolean; className?: string }) {
  return (
    <div className={cn("frame", className)}>
      {logoRow && <LogoRow />}
      {children}
    </div>
  );
}

export interface FieldBandProps {
  as?: "section" | "header" | "footer" | "div";
  id?: string;
  labelledBy?: string;
  label?: string;
  /** Background word; defaults to CLIMB. Pass ghostWord({ kind: "session", … }) on session pages, or false for none. */
  ghost?: string | false;
  bands?: "none" | "top" | "both";
  /** Deeper cobalt (#122C99) for variety. */
  deep?: boolean;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}

/**
 * A cobalt poster band: cream text, yellow focus ring, print grain, optional ghost word and corner bands.
 * Anything with ink text inside must sit on a cream .box / .box-2 / .panel (ink on cobalt is 2.39:1).
 */
export function FieldBand({
  as: Tag = "section", id, labelledBy, label, ghost = GHOST_DEFAULT, bands = "none", deep = false, className, innerClassName, children,
}: FieldBandProps) {
  return (
    <Tag id={id} aria-labelledby={labelledBy} aria-label={label} className={cn("field on-field", deep && "field-2", className)}>
      {ghost && <Ghost word={ghost} />}
      {bands !== "none" && <Bands edge="top" />}
      {bands === "both" && <Bands edge="bottom" />}
      <div className={cn("field-content", innerClassName)}>{children}</div>
    </Tag>
  );
}
```

- [ ] **Step 5: Rewrite `components/ui/Logo.tsx`**

```tsx
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { TOKENS } from "@/lib/design/tokens";

/** The st(AI)rway wordmark (Urbanist). "(AI)" sits on a yellow block with ink text: the brand's core. */
export function Wordmark({ className, block = true }: { className?: string; block?: boolean }) {
  return (
    <span className={cn("font-sans font-semibold tracking-[-0.04em]", className)} aria-label="st(AI)rway">
      <span aria-hidden>st</span>
      <span aria-hidden className={cn(block && "mx-[0.04em] bg-yellow px-[0.08em] text-ink")}>(AI)</span>
      <span aria-hidden>rway</span>
    </span>
  );
}

/** Square stair glyph: three steps climbing to a yellow block. `field` = cobalt square + cream stair (dark surfaces). */
export function StairMark({ size = 28, className, tone = "paper" }: { size?: number; className?: string; tone?: "paper" | "field" }) {
  const dark = tone === "field";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" fill={dark ? TOKENS.field : TOKENS.paper} stroke={dark ? TOKENS.paper : TOKENS.ink} strokeWidth="2" />
      <path d="M5 26 H12 V19 H19 V12 H26" fill="none" stroke={dark ? TOKENS.paper : TOKENS.ink} strokeWidth="2.5" strokeLinejoin="miter" />
      <rect x="21" y="5" width="7" height="7" fill={TOKENS.yellow} stroke={TOKENS.ink} strokeWidth="2" />
    </svg>
  );
}

export const WORDMARK_GLYPHS = ["s", "t", "(AI)", "r", "w", "a", "y"] as const;

type StairTag = "h1" | "h2" | "p" | "span";

/**
 * Extruded stair-step lettering: each glyph rises one step (--i) and casts a 10-layer ink extrusion. One sr-only
 * label gives screen readers a clean word; the glyph spans are aria-hidden. The climb-in animation runs only under
 * prefers-reduced-motion: no-preference (otherwise the glyphs render in their final position).
 */
export function StairText({
  glyphs, label, as: Tag = "p", id, className,
}: { glyphs: readonly string[]; label: string; as?: StairTag; id?: string; className?: string }) {
  return (
    <Tag id={id} className={cn("stair", className)}>
      <span className="sr-only">{label}</span>
      {glyphs.map((g, i) => (
        <span key={i} aria-hidden="true" className={cn("g", g === "(AI)" && "ai")} style={{ "--i": i } as CSSProperties}>
          {g}
        </span>
      ))}
    </Tag>
  );
}

/** The hero's st(AI)rway in stair lettering (an h1 by default). */
export function StairWordmark({ id, as = "h1", className }: { id?: string; as?: StairTag; className?: string }) {
  return <StairText glyphs={WORDMARK_GLYPHS} label="st(AI)rway" as={as} id={id} className={className} />;
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/design`
Expected: PASS.

- [ ] **Step 7: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/design/brand.ts lib/design/ghost.ts components/ui/Poster.tsx components/ui/Logo.tsx tests/design/ghost.test.ts tests/design/poster.test.ts
git commit -m "feat(design): poster primitives (field band, frame, ghost word, stair lettering)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Forms, countdown, step numbers, seats and error panels

**Files:**
- Create: `components/ui/StepNumber.tsx`, `tests/design/field.test.ts`
- Modify: `components/ui/Field.tsx` (whole file), `components/ui/Countdown.tsx` (whole file), `components/registration/QuestionField.tsx:3,15-22,26,64,101`, `components/registration/ErrorPanel.tsx:80`, `components/tickets/CancelledNotice.tsx:27`, `components/tickets/NewTicketBanner.tsx:30`, `app/me/tickets/error.tsx:23`, `components/ui/Avatar.tsx:5`, `components/ui/GalleryArt.tsx:5,17`, `tests/registration/form.test.ts:31`

**Interfaces:**
- Consumes: `TOKENS` (Task 1), `.stepnum` CSS (Task 2).
- Produces: `inputBase: string`, `inputCls: string`, `textareaCls: string`, `fieldDescribedBy(id, { error?, hint? }): string | undefined` (now `"<id>-err <id>-hint"` when both), `FieldError({ id, children })`, `Field(...)` (unchanged props), `StepNumber({ n: number; tone?: "field" | "ink"; className? })`, `Countdown` (unchanged props).

- [ ] **Step 1: Write the failing tests**

In `tests/registration/form.test.ts` change the first `fieldDescribedBy` expectation (line 31) to:

```ts
    expect(fieldDescribedBy("phone", { error: "Bad", hint: "Private" })).toBe("phone-err phone-hint");
```

Create `tests/design/field.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, inputCls } from "@/components/ui/Field";
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

  it("styles inputs as a white well with the cobalt focus ring and the error recipe", () => {
    for (const c of ["bg-white", "focus-visible:outline-field", "aria-[invalid=true]:border-l-8", "aria-[invalid=true]:bg-error-bg", "h-12"]) {
      expect(inputCls).toContain(c);
    }
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/design/field.test.ts tests/registration/form.test.ts`
Expected: FAIL — `phone-err` vs `phone-err phone-hint`, missing `StepNumber`, missing classes.

- [ ] **Step 3: Rewrite `components/ui/Field.tsx`**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared input skin without size: a white well with a soft inset shadow, a 3px cobalt focus ring, and the error
 * recipe (red-ink border with an 8px left edge on #FFF6F5).
 */
export const inputBase =
  "border-2 border-ink bg-white text-ink shadow-[inset_3px_3px_0_rgba(11,16,38,0.06)] placeholder:text-ink-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-field aria-[invalid=true]:border-red-ink aria-[invalid=true]:border-l-8 aria-[invalid=true]:bg-error-bg";
export const inputCls = cn("h-12 w-full px-4", inputBase);
export const textareaCls = cn("min-h-28 w-full px-4 py-3", inputBase);

/** `aria-describedby` for a control inside <Field>: its error (`<id>-err`) and its hint (`<id>-hint`), as rendered. */
export function fieldDescribedBy(id: string, { error, hint }: { error?: string; hint?: string }): string | undefined {
  const ids = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/** Error row: a decorative red "!" square and the message in red-ink on cream. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-2 text-sm font-semibold text-red-ink">
      <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center border-2 border-ink bg-red font-mono text-xs font-bold leading-none text-ink">
        !
      </span>
      <span>{children}</span>
    </p>
  );
}

export function Field({
  id, label, error, hint, required = false, children, className,
}: {
  id: string; label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mono mb-2 block font-bold">
        {label}
        {required && <span className="ml-0.5 text-red-ink" aria-hidden>*</span>}
      </label>
      {children}
      {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Use the recipe in QuestionField**

In `components/registration/QuestionField.tsx`:
- Replace the `lucide-react` import line and the `Field` import with:

```tsx
import { Field, FieldError, fieldDescribedBy, inputCls, textareaCls } from "@/components/ui/Field";
```

- Replace `GroupError` with:

```tsx
function GroupError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return <FieldError id={`${id}-err`}>{error}</FieldError>;
}
```

- In `optionCls` replace `has-[:focus-visible]:outline-blue-ink` with `has-[:focus-visible]:outline-field`.
- Replace both `accent-[#100f0d]` with `accent-ink`.

- [ ] **Step 5: Let every focusable notice use the `--focus` ring**

The base `:focus-visible` rule (3px `var(--focus)`, 3px offset) now draws these rings. Delete the class fragment `outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-blue-ink` (leave the rest of each className) in:
- `components/registration/ErrorPanel.tsx` → `className="border-2 border-ink bg-red/15 p-5"`
- `components/tickets/CancelledNotice.tsx` → `className="box-2 flex items-center gap-2 p-4 font-semibold shadow-[4px_4px_0_0_var(--ink)]"`
- `components/tickets/NewTicketBanner.tsx` → ``className={`border-2 border-ink p-5 shadow-[4px_4px_0_0_var(--ink)] ${confirmed ? "bg-green" : "bg-yellow"}`}``
- `app/me/tickets/error.tsx` → `className="box-2 grid gap-4 p-5 shadow-[4px_4px_0_0_var(--ink)]"`

Run: `git grep -n "outline-blue-ink" -- app components`
Expected: no output.

- [ ] **Step 6: Add the step number**

Create `components/ui/StepNumber.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { padStep } from "@/lib/design/ghost";

/**
 * Card step number: Anton digits (cobalt with a mini ink extrusion, or plain ink on colour fills) after three rising
 * ink bars. Size with `[--stepnum-size:…]` in className. The bars are decorative; the digits are read.
 */
export function StepNumber({ n, tone = "field", className }: { n: number; tone?: "field" | "ink"; className?: string }) {
  return (
    <span className={cn("stepnum", tone === "ink" && "stepnum-ink", className)}>
      <i aria-hidden="true" />
      <i aria-hidden="true" />
      <i aria-hidden="true" />
      <b>{padStep(n)}</b>
    </span>
  );
}
```

- [ ] **Step 7: Restyle the countdown cells**

Replace `components/ui/Countdown.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useClock } from "@/components/providers/ClockProvider";
import { pad2 } from "@/lib/weekends";
import { cn } from "@/lib/utils";

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const CELL = {
  sm: "h-16 w-16",
  md: "h-[4.5rem] w-[4.5rem] md:h-24 md:w-24",
  lg: "h-20 w-20 md:h-28 md:w-28",
};
const DIGIT = { sm: "text-3xl", md: "text-4xl md:text-5xl", lg: "text-5xl md:text-6xl" };

/** Poster countdown: ink cells, cream Anton digits, yellow mono units. Text-only updates (no live announcements per tick). */
export function Countdown({
  target,
  size = "md",
  className,
  label = "until the next step",
}: {
  target: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}) {
  const { now: clockNow } = useClock();
  const [tick, setTick] = useState(clockNow);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // the shared clock jumps to real time right after hydration; ticks refine it per second
  const t = split(new Date(target).getTime() - Math.max(tick, clockNow));
  const units: [string, number][] = [
    ["Days", t.d],
    ["Hours", t.h],
    ["Min", t.m],
    ["Sec", t.s],
  ];

  return (
    <div className={cn("inline-flex flex-col", className)}>
      <div className="flex items-start gap-1.5 md:gap-2" aria-hidden="true">
        {units.map(([u, v]) => (
          <div key={u} className={cn("flex flex-col items-center justify-center border-2 border-ink bg-ink text-paper", CELL[size])}>
            <span className={cn("block overflow-hidden font-display leading-none tabular", DIGIT[size])}>
              <span key={pad2(v)} className="block animate-[roll_0.25s_var(--ease)]">{pad2(v)}</span>
            </span>
            <span className="mt-1 font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-yellow">{u}</span>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {t.d} days, {t.h} hours and {t.m} minutes {label}
      </p>
    </div>
  );
}
```

(The live region and its minute-level text are unchanged.)

- [ ] **Step 8: Draw generated fills from the tokens**

In `components/ui/Avatar.tsx` add `import { TOKENS } from "@/lib/design/tokens";` and replace the `FILLS` line with:

```tsx
// Flat block colours for generated monograms (ink text stays AA on all of them).
const FILLS = [TOKENS.yellow, TOKENS.blue, TOKENS.green, TOKENS.red, TOKENS.purple, TOKENS.orange, TOKENS.paper3];
```

In `components/ui/GalleryArt.tsx` add the same import, replace `FILLS` with:

```tsx
const FILLS = [TOKENS.yellow, TOKENS.blue, TOKENS.green, TOKENS.red, TOKENS.purple, TOKENS.orange];
```

and in the `<rect …>` replace `fill={i === 4 ? fill : "#ECE4D7"} stroke="#100F0D"` with `fill={i === 4 ? fill : TOKENS.paper2} stroke={TOKENS.ink}`.

- [ ] **Step 9: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add components/ui/Field.tsx components/ui/StepNumber.tsx components/ui/Countdown.tsx components/ui/Avatar.tsx components/ui/GalleryArt.tsx components/registration/QuestionField.tsx components/registration/ErrorPanel.tsx components/tickets/CancelledNotice.tsx components/tickets/NewTicketBanner.tsx app/me/tickets/error.tsx tests/design/field.test.ts tests/registration/form.test.ts
git commit -m "feat(design): form error recipe, poster countdown, step numbers and token fills" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Chrome — ink top bar, cobalt strip, cobalt dock item, cobalt footer

**Files:**
- Create: `lib/design/dock.ts`, `tests/design/dock.test.ts`
- Modify: `components/layout/TopBar.tsx` (whole file), `components/layout/AnnouncementBar.tsx:56`, `components/layout/AccountButton.tsx:24`, `components/layout/Dock.tsx:9,80-88`, `components/layout/Footer.tsx` (whole file), `.claude/launch.json` (local only, not committed)

**Interfaces:**
- Consumes: `FieldBand` (Task 3), `StairMark({ tone: "field" })`, `Wordmark` (Task 3), `.topbar` CSS (Task 2).
- Produces: `dockItemClass(on: boolean): string`; a `stairway-dev` entry in `.claude/launch.json` used for visual smoke checks in later tasks.

- [ ] **Step 1: Write the failing dock test**

Create `tests/design/dock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dockItemClass } from "@/lib/design/dock";

describe("dockItemClass", () => {
  it("marks the active item cobalt with cream text (red is only for urgency and errors)", () => {
    expect(dockItemClass(true)).toContain("bg-field text-paper");
    expect(dockItemClass(true)).not.toContain("bg-red");
  });
  it("keeps idle items on paper-2 with ink text", () => {
    expect(dockItemClass(false)).toContain("bg-paper-2 text-ink");
  });
  it("keeps 48px targets either way", () => {
    for (const on of [true, false]) expect(dockItemClass(on)).toContain("h-12 min-w-12");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/design/dock.test.ts`
Expected: FAIL — cannot resolve `@/lib/design/dock`.

- [ ] **Step 3: Write the dock helper and use it**

Create `lib/design/dock.ts`:

```ts
const BASE =
  "flex h-12 min-w-12 items-center justify-center gap-2 border-2 border-ink px-3 font-mono text-[0.72rem] font-bold uppercase tracking-[0.12em] transition-[background,transform] duration-150 hover:-translate-y-0.5";

/** Dock item classes: the active item is cobalt with cream text (red is reserved for urgency and errors). */
export function dockItemClass(on: boolean): string {
  return `${BASE} ${on ? "bg-field text-paper" : "bg-paper-2 text-ink hover:bg-paper-3"}`;
}
```

In `components/layout/Dock.tsx` add `import { dockItemClass } from "@/lib/design/dock";` and replace the item link's

```tsx
                className={cn(
                  "flex h-12 min-w-12 items-center justify-center gap-2 border-2 border-ink px-3 font-mono text-[0.72rem] font-bold uppercase tracking-[0.12em] transition-[background,transform] duration-150 hover:-translate-y-0.5",
                  on ? "bg-red" : "bg-paper-2 hover:bg-paper-3",
                )}
```

with

```tsx
                className={dockItemClass(on)}
```

(`cn` stays imported: the label `<span>` still uses it.)

- [ ] **Step 4: Run the dock test**

Run: `npx vitest run tests/design/dock.test.ts`
Expected: PASS.

- [ ] **Step 5: Ink top bar**

Replace `components/layout/TopBar.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { StairMark, Wordmark } from "@/components/ui/Logo";
import { AnnouncementBar } from "./AnnouncementBar";
import { AccountButton } from "./AccountButton";
import { useClock } from "@/components/providers/ClockProvider";
import { formatDate, pad2 } from "@/lib/weekends";

/** Slim ink top bar (yellow focus ring): brand on the left, the next step on the right. Main navigation lives in the dock. */
export function TopBar() {
  const { next } = useClock();
  return (
    <header className="sticky top-0 z-40">
      <AnnouncementBar />
      <div className="topbar border-b-2 border-ink bg-ink text-paper">
        <div className="wrap flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 text-[1.6rem]" aria-label="st(AI)rway home">
            <StairMark size={28} tone="field" />
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            {next && (
              <Link
                href={`/events/${next.slug}`}
                className="btn btn-sm btn-secondary !px-3"
                aria-label={`Next: Step ${next.step}, ${next.title}, ${formatDate(next.start, { day: "numeric", month: "long" })}`}
              >
                <CalendarDays size={16} strokeWidth={2} aria-hidden />
                <span className="hidden sm:inline">Next ·</span> Step {pad2(next.step)}
                <span className="hidden md:inline">· {formatDate(next.start, { day: "2-digit", month: "short" })}</span>
              </Link>
            )}
            <AccountButton />
          </div>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 6: Cobalt announcement strip and the account chip on ink**

In `components/layout/AnnouncementBar.tsx` change the outer wrapper to:

```tsx
    <div className="on-field relative border-b-2 border-ink bg-field text-paper">
```

In `components/layout/AccountButton.tsx` change the signed-in link's className to:

```tsx
      className="flex h-11 items-center gap-2 border-2 border-paper bg-paper pl-1 pr-3 text-ink shadow-[3px_3px_0_0_var(--yellow)] hover:bg-yellow"
```

(The signed-out "Sign in" `btn btn-sm btn-primary` gets its cream shadow from `.topbar .btn-primary`.)

- [ ] **Step 7: Cobalt footer**

Replace `components/layout/Footer.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { ArrowUp, Mail, MapPin, Phone } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { useClock } from "@/components/providers/ClockProvider";
import { useRegisterHref } from "@/components/registration/useRegisterHref";
import { openSlug } from "@/lib/weekends";
import { StairMark, Wordmark } from "@/components/ui/Logo";
import { FieldBand } from "@/components/ui/Poster";
import { Instagram, Linkedin, Whatsapp, Youtube, Github } from "@/components/ui/BrandIcons";
import { SmartLink } from "@/components/ui/SmartLink";

const SOCIALS = [
  { key: "instagram", Icon: Instagram, label: "Instagram" },
  { key: "linkedin", Icon: Linkedin, label: "LinkedIn" },
  { key: "whatsapp", Icon: Whatsapp, label: "WhatsApp" },
  { key: "youtube", Icon: Youtube, label: "YouTube" },
  { key: "github", Icon: Github, label: "GitHub" },
] as const;

const link = "inline-flex min-h-11 items-center underline-offset-4 hover:underline lg:min-h-9";

/** Cobalt footer: cream text and a yellow focus ring; icon tiles and the map stay on cream/ink. */
export function Footer() {
  const { settings: event, societies } = useSiteData();
  const { next } = useClock();
  const registerHref = useRegisterHref();
  const socials = SOCIALS.map(({ key, Icon, label }) => ({ href: event.social[key], Icon, label }));
  return (
    // extra bottom padding keeps content clear of the floating dock
    <FieldBand as="footer" ghost={false} className="border-t-2 border-ink pb-[calc(var(--dock-h)+48px)] pt-16">
      <div className="wrap">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5 text-3xl" aria-label="st(AI)rway home">
              <StairMark size={32} tone="field" />
              <Wordmark />
            </Link>
            <p className="mt-4 max-w-xs">{event.tagline}</p>
            <p className="mt-4 text-sm">
              Organised by{" "}
              <a className="font-semibold underline underline-offset-4" href={event.organizer.url} target="_blank" rel="noopener noreferrer">
                {event.organizer.name}
              </a>
              .
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {socials.map(({ href, Icon, label }) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid h-11 w-11 place-items-center border-2 border-ink bg-paper text-ink hover:bg-yellow">
                    <Icon size={18} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label="Quick links">
            <h2 className="mono mb-4 font-bold">Quick links</h2>
            <ul>
              {[
                ["/#about", "About"],
                ["/#societies", "Societies"],
                ["/#speakers", "Speakers"],
                ["/gallery", "Gallery"],
                ["/resources", "Resources"],
                ["/#sponsors", "Sponsors"],
                ["/#faq", "FAQ"],
                [registerHref(openSlug(next)), "Register"],
              ].map(([href, label]) => (
                <li key={label}><SmartLink href={href} className={link}>{label}</SmartLink></li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Societies">
            <h2 className="mono mb-4 font-bold">Societies</h2>
            <ul className="grid grid-cols-2 gap-x-4 text-sm lg:grid-cols-1">
              {societies.map((s) => (
                <li key={s.slug} className="min-w-0">
                  <Link href={`/s/${s.slug}`} className="flex min-h-11 w-full min-w-0 items-center gap-2 underline-offset-4 hover:underline lg:min-h-9">
                    <span className="font-mono font-bold">{s.shortName}</span>
                    <span className="truncate">— {s.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="mono mb-4 font-bold">Contact</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-3">
                <Mail size={18} strokeWidth={2} className="shrink-0" aria-hidden />
                <a href={`mailto:${event.contact.email}`} className={`${link} break-all`}>{event.contact.email}</a>
              </li>
              {event.contact.coordinators.map((c) => (
                <li key={c.phone} className="flex gap-3">
                  <Phone size={18} strokeWidth={2} className="mt-3 shrink-0" aria-hidden />
                  <span>
                    <a href={`tel:${c.phone.replace(/\s/g, "")}`} className={link}>{c.phone}</a>
                    <span className="block">{c.name} · {c.role}</span>
                  </span>
                </li>
              ))}
              <li className="flex gap-3 pt-2">
                <MapPin size={18} strokeWidth={2} className="shrink-0" aria-hidden />
                <span>{event.venue.name}, {event.venue.address}</span>
              </li>
            </ul>
            <div className="mt-5 border-2 border-ink shadow-[4px_4px_0_0_var(--ink)]">
              <iframe title={`Map of ${event.venue.name}`} src={event.venue.mapEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="block h-44 w-full grayscale" />
            </div>
          </div>
        </div>

        <p aria-hidden className="mt-16 select-none overflow-hidden whitespace-nowrap font-display text-[18vw] uppercase leading-[0.8] text-paper/[0.08] lg:text-[13rem]">
          st(AI)rway
        </p>

        <div className="mt-6 flex flex-col-reverse items-start justify-between gap-6 border-t-2 border-paper/40 pt-6 sm:flex-row sm:items-center">
          <div className="text-sm">
            <p>© 2026 IEEE SB CEK · Made with ⚡ by the st(AI)rway team</p>
            <p className="flex gap-6">
              <Link href="/code-of-conduct" className={link}>Code of Conduct</Link>
              <Link href="/privacy" className={link}>Privacy Policy</Link>
            </p>
          </div>
          <button
            onClick={() => {
              window.scrollTo({ top: 0 });
              document.getElementById("main")?.focus({ preventScroll: true });
            }}
            className="btn btn-secondary"
          >
            <ArrowUp size={16} strokeWidth={2} /> Back to top
          </button>
        </div>
      </div>
    </FieldBand>
  );
}
```

- [ ] **Step 8: Add a dev-server preview entry (local, not committed)**

`.claude/launch.json` already has `stairway` (`npm run start -p 3123`, needs a build). Add a dev entry so later tasks can smoke-check without a full build. The file should read:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "stairway",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "start", "--", "-p", "3123"],
      "port": 3123
    },
    {
      "name": "stairway-dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev", "--", "-p", "3124"],
      "port": 3124
    }
  ]
}
```

- [ ] **Step 9: Visual smoke check**

Start the `stairway-dev` preview (Browser pane `preview_start` with name `stairway-dev`). At 375 (`resize_window` preset `mobile`) and 1280 (`resize_window` width 1280, height 900), screenshot `/` top and bottom. Check: ink top bar with the cobalt stair mark and the yellow (AI) block; the cobalt announcement strip (when an announcement is enabled); the dock's active "Home" item is cobalt with a cream icon/label (not red); the footer is cobalt with cream text, cream icon tiles with ink icons, and Tab moves a **yellow** ring through the footer links. Reset with `resize_window` preset `desktop`. Fix anything off before committing.

- [ ] **Step 10: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/design/dock.ts tests/design/dock.test.ts components/layout/TopBar.tsx components/layout/AnnouncementBar.tsx components/layout/AccountButton.tsx components/layout/Dock.tsx components/layout/Footer.tsx
git commit -m "feat(design): ink top bar, cobalt announcement strip, cobalt dock item and footer" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Home hero poster and stats strip

**Files:**
- Create: `lib/design/hero.ts`, `tests/design/hero.test.ts`
- Modify: `components/sections/Hero.tsx` (whole file), `app/globals.css` (delete `.h-hero`, `.blur-in`, `@keyframes blur-in`), `tests/design/css-contract.test.ts` (one new test)

**Interfaces:**
- Consumes: `FieldBand`, `Frame`, `StairWordmark`, `ghostWord`, `padStep` (Task 3), `Button` `variant="ghost"` (Task 2), `Countdown` (Task 4), `formatDate` (`lib/weekends.ts`).
- Produces: `interface RuleHead { lead: string; verb: "opens" | "is on"; when: string }`, `ruleHead(ev: { step: number; start: string }, now: number): RuleHead`, `handleFromUrl(url: string): string | null`, `heroHandles(s: { social: { instagram: string }; siteUrl: string }): string[]`. The home section with `id="top"` is now the field band (the dock's scroll-spy target is unchanged).

- [ ] **Step 1: Write the failing tests**

Create `tests/design/hero.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { handleFromUrl, heroHandles, ruleHead } from "@/lib/design/hero";

describe("ruleHead", () => {
  const ev = { step: 4, start: "2026-10-17T04:00:00Z" }; // Sat 17 Oct, 09:30 IST

  it("reads Step 04 opens Sat 17 Oct before the start", () => {
    expect(ruleHead(ev, Date.parse("2026-10-09T00:00:00Z"))).toEqual({ lead: "Step 04", verb: "opens", when: "Sat 17 Oct" });
  });

  it("switches the verb once the step has started", () => {
    expect(ruleHead(ev, Date.parse("2026-10-17T05:00:00Z")).verb).toBe("is on");
  });
});

describe("handles row", () => {
  it("turns a profile URL into an @handle", () => {
    expect(handleFromUrl("https://instagram.com/ieeesbcek")).toBe("@ieeesbcek");
    expect(handleFromUrl("https://www.instagram.com/ieeesbcek/")).toBe("@ieeesbcek");
    expect(handleFromUrl("https://instagram.com/")).toBeNull();
    expect(handleFromUrl("not a url")).toBeNull();
  });

  it("lists the Instagram handle and the site host", () => {
    expect(heroHandles({ social: { instagram: "https://instagram.com/ieeesbcek" }, siteUrl: "https://stairway.ieeesbcek.workers.dev" })).toEqual([
      "@ieeesbcek",
      "stairway.ieeesbcek.workers.dev",
    ]);
    expect(heroHandles({ social: { instagram: "" }, siteUrl: "nope" })).toEqual([]);
  });
});
```

Append inside the `describe` block of `tests/design/css-contract.test.ts`:

```ts
  it("drops the old blur-in hero classes", () => {
    expect(css).not.toContain(".h-hero");
    expect(css).not.toContain("blur-in");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/design/hero.test.ts tests/design/css-contract.test.ts`
Expected: FAIL — cannot resolve `@/lib/design/hero`; `.h-hero` still present.

- [ ] **Step 3: Write the hero helpers**

Create `lib/design/hero.ts`:

```ts
import { formatDate } from "@/lib/weekends";
import { padStep } from "./ghost";

export interface RuleHead {
  lead: string;
  verb: "opens" | "is on";
  when: string;
}

/** The hero's poster rule head, e.g. "Step 04 opens Sat 17 Oct" (IST date); "is on" once the step has started. */
export function ruleHead(ev: { step: number; start: string }, now: number): RuleHead {
  return {
    lead: `Step ${padStep(ev.step)}`,
    verb: Date.parse(ev.start) > now ? "opens" : "is on",
    when: formatDate(ev.start, { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, ""),
  };
}

/** "@handle" from a profile URL's first path segment, or null. */
export function handleFromUrl(url: string): string | null {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean)[0];
    return seg ? `@${seg}` : null;
  } catch {
    return null;
  }
}

/** The handles row under the hero: the Instagram handle and the site's host, whichever are valid. */
export function heroHandles(s: { social: { instagram: string }; siteUrl: string }): string[] {
  let host: string | null = null;
  try {
    host = new URL(s.siteUrl).host;
  } catch {
    host = null;
  }
  return [handleFromUrl(s.social.instagram), host].filter((x): x is string => !!x);
}
```

- [ ] **Step 4: Remove the old hero CSS**

In `app/globals.css` delete these lines:

```css
  /* removed in Task 6 together with .blur-in, once the hero uses the stair lettering */
  .h-hero { font-size: clamp(3.4rem, 15vw, 10rem); font-weight: 500; letter-spacing: -0.045em; line-height: 0.95; }
```

```css
  /* hero wordmark: blur → sharp (removed in Task 6) */
  .blur-in { animation: blur-in 1.1s var(--ease) both; }
  @keyframes blur-in { from { filter: blur(16px); opacity: 0; } to { filter: blur(0); opacity: 1; } }
```

- [ ] **Step 5: Rewrite the hero**

Replace `components/sections/Hero.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, Hourglass, MapPin } from "lucide-react";
import { Countdown } from "@/components/ui/Countdown";
import { Button } from "@/components/ui/Button";
import { StairWordmark } from "@/components/ui/Logo";
import { FieldBand, Frame } from "@/components/ui/Poster";
import { useClock } from "@/components/providers/ClockProvider";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { ghostWord } from "@/lib/design/ghost";
import { heroHandles, ruleHead } from "@/lib/design/hero";
import { openSlug, pad2, registerHref, shortDate, timeOf } from "@/lib/weekends";
import { cn } from "@/lib/utils";

// number colours cycle through the text-safe accents
const STAT_COLORS = ["text-blue-ink", "text-green-ink", "text-red-ink", "text-purple-ink", "text-amber-ink"];

/**
 * The poster: a framed cobalt field with the extruded stair-step wordmark, the next step's rule head and the handles
 * row. The next-step panel (countdown) and the stats strip follow on cream so they stay easy to read.
 */
export function Hero() {
  const { settings: event, stats } = useSiteData();
  const { next, now } = useClock();
  const head = next ? ruleHead(next, now) : null;
  const handles = heroHandles(event);

  return (
    <>
      <FieldBand
        id="top"
        labelledBy="hero-title"
        ghost={ghostWord({ kind: "home" })}
        bands="both"
        className="border-b-2 border-ink py-[clamp(64px,10vw,132px)]"
      >
        <div className="wrap">
          <Frame>
            <div className="mt-[clamp(18px,3vw,30px)]">
              <p className="presents mb-2">
                <b>{event.organizer.short}</b>
                <small>presents a weekend AI series</small>
              </p>
              <StairWordmark id="hero-title" />
              <p className="mono-wide stair-cap">One weekend · one step · climb into AI</p>
            </div>

            <p className="tagline fade-up mt-[clamp(28px,4vw,44px)]" style={{ ["--d" as string]: 2 }}>
              {event.tagline} Workshops, labs, talks and a 24-hour hackathon — one step every weekend at College of Engineering Kidangoor.
            </p>

            <div className="fade-up mt-6 flex flex-col gap-3 sm:flex-row" style={{ ["--d" as string]: 3 }}>
              <Button href={registerHref(openSlug(next), event.registration)} size="lg" trackAs="register_click" trackProps={{ from: "hero" }}>
                Claim your step <ArrowRight size={18} strokeWidth={2} />
              </Button>
              <Button href="#societies" variant="ghost" size="lg">
                <ArrowDown size={18} strokeWidth={2} /> Explore the societies
              </Button>
            </div>

            {head && (
              <p className="rule-h soon mt-[clamp(30px,4vw,48px)]">
                <span>
                  {head.lead} <span className="text-yellow">{head.verb}</span> {head.when}
                </span>
              </p>
            )}
            {handles.length > 0 && (
              <p className="mono mt-3.5 flex flex-wrap justify-center gap-x-[18px] gap-y-1.5 text-center">
                {handles.map((h) => (
                  <span key={h}>{h}</span>
                ))}
              </p>
            )}
          </Frame>
        </div>
      </FieldBand>

      {/* next step panel, on cream */}
      {next && (
        <div className="border-b-2 border-ink bg-paper-2">
          <div className="wrap py-10 md:py-12">
            <div className="fade-up max-w-3xl border-2 border-ink bg-paper shadow-[6px_6px_0_0_var(--ink)]" style={{ ["--d" as string]: 4 }}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-5 py-3">
                <span className="flex items-center gap-2">
                  <span className="tag tag-red"><Hourglass size={12} strokeWidth={2.5} aria-hidden /> Next step</span>
                  <span className="tag tag-outline">Step {pad2(next.step)}</span>
                </span>
                <span className="meta-label text-ink-3">
                  <MapPin size={14} strokeWidth={2} aria-hidden /> {shortDate(next.start)} · {timeOf(next.start)}
                </span>
              </div>
              <div className="flex flex-col gap-6 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <Link href={`/events/${next.slug}`} className="text-2xl font-semibold underline-offset-4 hover:underline md:text-3xl">
                    {next.title}
                  </Link>
                  <p className="mono mt-1 text-ink-3">{next.topic}</p>
                </div>
                <Countdown target={next.start} size="sm" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* stats strip */}
      <dl className="grid grid-cols-2 border-b-2 border-ink bg-paper md:grid-cols-5">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "flex flex-col-reverse border-ink px-5 py-6 md:px-8",
              i < stats.length - 1 && "max-md:border-b-2 md:border-r-2",
              i % 2 === 0 && i < stats.length - 1 && "max-md:border-r-2",
              i === stats.length - 1 && "col-span-2 md:col-span-1",
            )}
          >
            <dt className="mono mt-1 font-bold text-ink-3">{s.label}</dt>
            <dd className={cn("font-display text-5xl leading-none md:text-6xl", STAT_COLORS[i % STAT_COLORS.length])}>
              {s.value}
              {s.suffix}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/design`
Expected: PASS.

- [ ] **Step 7: Visual smoke check (375 and 1280)**

With the `stairway-dev` preview: at 375 the stair lettering `st(AI)rway` fits inside the frame with **no horizontal scroll** (`javascript_tool`: `document.documentElement.scrollWidth` → `375`), the glyphs step up left to right, `(AI)` is on yellow with an ink extrusion, the rotated caption fits on one line, the rule head "STEP 04 OPENS SAT 17 OCT" (yellow verb) fits on one line, and "Explore the societies" is a cream-outlined transparent button. At 1280 the frame, the logo row (`IEEE SB CE KIDANGOOR` · `IEEE`), the top and bottom corner bands and the faint CLIMB ghost match `mockup-desktop-1280.png`. Tab through: the focus ring is **yellow** inside the field. Compare against the mock-up screenshots side by side; fix drift before committing.

- [ ] **Step 8: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/design/hero.ts tests/design/hero.test.ts tests/design/css-contract.test.ts components/sections/Hero.tsx app/globals.css
git commit -m "feat(home): cobalt poster hero with extruded stair-step wordmark" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Section headers and the first home bands (ticker, spotlight, societies, stairway rows)

**Files:**
- Create: `tests/design/heading.test.ts`
- Modify: `components/ui/Heading.tsx` (whole file), `components/ui/SectionHeader.tsx` (whole file), `components/sections/Marquee.tsx:21,27`, `components/sections/NextWeekend.tsx:34,40,52`, `components/sections/Societies.tsx:86-88,120-121`, `components/sections/WeekendCard.tsx:42,48`, `components/sections/Community.tsx:52`

**Interfaces:**
- Consumes: `FieldBand` (Task 3), `StepNumber` (Task 4), `TOKENS` (Task 1).
- Produces: `Heading({ as?, text, className?, id?, tone?: "paper" | "field", rule?: "left" | "both" })`, `MARK_PAPER`, `MARK_FIELD` (class strings); `SectionHeader({ …existing props, tone?: "paper" | "field" })` — always renders an Anton `.h2` rule heading (left rule; both rules when centred).

- [ ] **Step 1: Write the failing heading test**

Create `tests/design/heading.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/design/heading.test.ts`
Expected: FAIL — `MARK_PAPER`/`MARK_FIELD` are not exported.

- [ ] **Step 3: Rewrite `components/ui/Heading.tsx`**

```tsx
import { createElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tag = "h1" | "h2" | "h3" | "p";

/** Yellow highlighter stroke for [[words]] on cream. */
export const MARK_PAPER = "bg-[linear-gradient(transparent_58%,var(--yellow)_58%,var(--yellow)_92%,transparent_92%)] px-[0.05em] text-inherit";
/** On the field the marked words turn yellow instead (cream text on a yellow marker would be unreadable). */
export const MARK_FIELD = "bg-transparent text-yellow";

/**
 * Heading with an optional highlighter: wrap words in [[double brackets]]. `rule` draws the poster rule heading
 * (lead rule · words · trailing rule); the words then sit in one span so the flex layout keeps their spaces.
 */
export function Heading({
  as = "h2", text, className, id, tone = "paper", rule,
}: { as?: Tag; text: string; className?: string; id?: string; tone?: "paper" | "field"; rule?: "left" | "both" }) {
  const parts: ReactNode[] = text.split(/(\[\[.+?\]\])/g).filter(Boolean).map((tok, i) =>
    tok.startsWith("[[") ? (
      <mark key={i} className={tone === "field" ? MARK_FIELD : MARK_PAPER}>
        {tok.slice(2, -2)}
      </mark>
    ) : (
      tok
    ),
  );
  const body = rule ? <span className="min-w-0 max-w-[20ch]">{parts}</span> : parts;
  return createElement(as, { id, className: cn(rule && "rule-h", rule === "left" && "left", className) || undefined, "data-reveal": "" }, body);
}
```

- [ ] **Step 4: Rewrite `components/ui/SectionHeader.tsx`**

```tsx
import type { LucideIcon } from "lucide-react";
import { Heading } from "./Heading";
import { cn } from "@/lib/utils";

/** Mono eyebrow + Anton rule heading (+ lead). Use `tone="field"` inside a FieldBand (cream text, yellow marked words). */
export function SectionHeader({
  id,
  eyebrow,
  title,
  lead,
  Icon,
  align = "left",
  tone = "paper",
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  Icon?: LucideIcon;
  align?: "left" | "center";
  tone?: "paper" | "field";
  className?: string;
}) {
  return (
    <header className={cn("mb-10 md:mb-14", align === "center" && "mx-auto flex flex-col items-center text-center", className)}>
      <p className="eyebrow mb-4" data-reveal>
        {Icon && <Icon size={16} strokeWidth={2} aria-hidden />}
        {eyebrow}
      </p>
      <Heading id={id} text={title} tone={tone} rule={align === "center" ? "both" : "left"} className={cn("h2", align === "center" && "w-full")} />
      {lead && (
        <p className={cn("lead mt-5", align === "center" && "mx-auto")} data-reveal style={{ ["--d" as string]: 2 }}>
          {lead}
        </p>
      )}
    </header>
  );
}
```

In `components/sections/Community.tsx` give the newsletter heading the same rule:

```tsx
          <Heading id="community-title" text="Never miss a [[step.]]" rule="left" className="h2" />
```

- [ ] **Step 5: Run the heading test**

Run: `npx vitest run tests/design/heading.test.ts`
Expected: PASS.

- [ ] **Step 6: Ink ticker**

In `components/sections/Marquee.tsx` change the separator and the wrapper:

```tsx
          <span className="font-mono text-paper/60" aria-hidden>{"<>"}</span>
```

```tsx
    <div className="border-b-2 border-ink bg-ink py-3" role="region" aria-label="Topics covered">
```

- [ ] **Step 7: Spotlight in poster type**

In `components/sections/NextWeekend.tsx`:
- add `import { TOKENS } from "@/lib/design/tokens";`
- in the poster `<rect …>` replace `fill={i === 5 ? "#FFB200" : i % 2 ? "#E2D8C8" : "#ECE4D7"} stroke="#100F0D"` with `fill={i === 5 ? TOKENS.yellow : i % 2 ? TOKENS.paper3 : TOKENS.paper2} stroke={TOKENS.ink}`
- replace the big step number paragraph with:

```tsx
              <p className="font-display text-[clamp(5rem,14vw,9rem)] leading-none text-field [text-shadow:0.04em_-0.04em_0_var(--ink)]">{pad2(next.step)}</p>
```

- replace the title's opening tag with:

```tsx
            <h2 id="next-title" className="h-display mt-4 text-[clamp(2.2rem,4.4vw,3.4rem)]">
```

- [ ] **Step 8: Societies (the stairway list) on the field**

In `components/sections/Societies.tsx` add `import { FieldBand } from "@/components/ui/Poster";`, replace the opening `<section id="societies" aria-labelledby="societies-title" className="section section-alt">` with

```tsx
    <FieldBand id="societies" labelledBy="societies-title" ghost={false} bands="top" className="section border-y-2 border-ink">
```

its closing `</section>` with `</FieldBand>`, and add `tone="field"` to its `<SectionHeader … />`. The society cards (`box`) and the quiz (`box-2`) stay cream above the grain, so their ink text never touches the cobalt.

- [ ] **Step 9: Stairway rows get the poster step number and the cobalt society tag**

In `components/sections/WeekendCard.tsx` add `import { StepNumber } from "@/components/ui/StepNumber";`, replace

```tsx
        <span className="font-mono text-4xl font-bold leading-none sm:text-6xl">{pad2(w.step)}</span>
```

with

```tsx
        <StepNumber n={w.step} tone="ink" className="[--stepnum-size:2.4rem] sm:[--stepnum-size:3.4rem]" />
```

and `<span className="tag tag-ink">{w.society.shortName}</span>` with `<span className="tag tag-field">{w.society.shortName}</span>`.

- [ ] **Step 10: Visual smoke check**

`stairway-dev` at 375 and 1280: every section title is Anton uppercase with a lead rule and a trailing rule; Societies is a cobalt band (top corner band, cream heading with the yellow "STAIRWAY." word, cream cards); the ticker is an ink strip; on `/s/cs` each row shows the barred step number on its society colour and a cobalt society tag. No horizontal scroll at 375.

- [ ] **Step 11: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add components/ui/Heading.tsx components/ui/SectionHeader.tsx tests/design/heading.test.ts components/sections/Marquee.tsx components/sections/NextWeekend.tsx components/sections/Societies.tsx components/sections/WeekendCard.tsx components/sections/Community.tsx
git commit -m "feat(home): Anton rule headings, ink ticker, cobalt societies band, poster step numbers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The rest of the home page (testimonials, IEEE, sponsors, CTA, gallery mats, inputs)

**Files:**
- Modify: `components/sections/Testimonials.tsx:30,32,334-335,389`, `components/sections/AboutIEEE.tsx` (whole file), `components/sections/Sponsors.tsx:70-84`, `components/sections/FinalCTA.tsx:19,36`, `components/sections/Gallery.tsx:87-96`, `components/sections/Resources.tsx:28-40`, `components/sections/Community.tsx:62-72`

**Interfaces:**
- Consumes: `FieldBand` (Task 3), `SectionHeader` `tone` (Task 7), `inputBase` (Task 4), `.h-display` (Task 2).
- Produces: the final home band rhythm — field: hero, Societies, Testimonials, About IEEE, footer; ink: top bar, ticker; yellow: Final CTA; cream elsewhere. `GalleryGrid` items are cream mats (also used by `/gallery`).

This task is presentational (no new logic). Its test cycle is the full suite plus the visual check in Step 8.

- [ ] **Step 1: Testimonials on the field**

In `components/sections/Testimonials.tsx` add `import { FieldBand } from "@/components/ui/Poster";`, replace the opening `<section id="testimonials" aria-labelledby="testimonials-title" className="section section-alt">` with

```tsx
    <FieldBand id="testimonials" labelledBy="testimonials-title" ghost={false} bands="top" className="section border-y-2 border-ink">
```

its closing `</section>` with `</FieldBand>`, add `tone="field"` to its `<SectionHeader … />`, and change the carousel box's shadow class `shadow-[6px_6px_0_0_var(--ink)]` to `shadow-[8px_8px_0_0_var(--ink)]` (spec: 8px on the field). The quote, dots and controls all stay inside the cream `box`.

- [ ] **Step 2: About IEEE on the field**

Replace `components/sections/AboutIEEE.tsx` with:

```tsx
import { ArrowUpRight, Globe2, Lightbulb, Users2 } from "lucide-react";
import { getSiteData } from "@/lib/site/load";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FieldBand } from "@/components/ui/Poster";

const FACTS = [
  { Icon: Globe2, k: "400K+", v: "IEEE members in 190+ countries", c: "text-blue-ink" },
  { Icon: Users2, k: "8", v: "Technical societies active at CEK", c: "text-green-ink" },
  { Icon: Lightbulb, k: "60+", v: "Events run by IEEE SB CEK", c: "text-purple-ink" },
];

/** Organiser band on the field: cream copy on cobalt, facts on a cream panel. */
export async function AboutIEEE() {
  const { settings: event } = await getSiteData();
  return (
    <FieldBand id="ieee" labelledBy="ieee-title" ghost={false} bands="top" className="section border-y-2 border-ink">
      <div className="wrap grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <SectionHeader id="ieee-title" eyebrow="Organised by" title="IEEE Student Branch, [[CEK.]]" tone="field" className="!mb-6" />
          <div className="space-y-4" data-reveal>
            <p><strong>IEEE</strong> is the world&apos;s largest technical professional organisation, dedicated to advancing technology for the benefit of humanity.</p>
            <p>The <strong>IEEE Student Branch at College of Engineering Kidangoor</strong> brings that mission to campus — workshops, hackathons, industrial visits and technical talks through its societies, including Computer Society, Robotics &amp; Automation, Power &amp; Energy and Women in Engineering.</p>
            <p>st(AI)rway is our most ambitious series yet: a structured climb into artificial intelligence, open to every student.</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3" data-reveal>
            <a href={event.ieee.joinUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Join IEEE <ArrowUpRight size={16} strokeWidth={2} /></a>
            <a href={event.ieee.branchUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Visit IEEE SB CEK</a>
          </div>
        </div>
        <div className="box shadow-[8px_8px_0_0_var(--ink)]" data-reveal>
          <div className="flex items-center gap-4 border-b-2 border-ink bg-blue p-5">
            <span className="grid h-14 w-14 place-items-center border-2 border-ink bg-paper font-mono font-bold">IEEE</span>
            <div>
              <p className="text-xl font-semibold">IEEE SB CEK</p>
              <p className="mono font-bold">Kerala Section · Region 10</p>
            </div>
          </div>
          <dl>
            {FACTS.map(({ Icon, k, v, c }) => (
              <div key={v} className="flex items-center gap-4 border-b-2 border-ink p-5 last:border-b-0">
                <Icon size={24} strokeWidth={2} aria-hidden />
                <dt className="sr-only">{v}</dt>
                <dd>
                  <span className={`block font-display text-4xl ${c}`}>{k}</span>
                  <span className="text-sm text-ink-3" aria-hidden>{v}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </FieldBand>
  );
}
```

- [ ] **Step 3: Sponsor call-out as a small field card**

In `components/sections/Sponsors.tsx` replace the whole "Become a sponsor" block (`<div className="wrap mt-14"> … </div>` at the end of the section) with:

```tsx
      <div className="wrap mt-14">
        <div className="field on-field border-2 border-ink p-6 shadow-[6px_6px_0_0_var(--ink)] md:p-10" data-reveal>
          <div className="field-content flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h3 className="h-display text-3xl md:text-4xl">Become a sponsor</h3>
              <p className="mt-2 max-w-xl">Put your brand in front of 500+ engineering students across 12 weekends — and help build Kerala&apos;s next generation of AI builders.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {event.sponsorDeckUrl ? (
                <a href={event.sponsorDeckUrl} className="btn btn-primary" download><Download size={16} strokeWidth={2} /> Sponsorship deck</a>
              ) : (
                <a href={`mailto:${event.contact.sponsorEmail}?subject=Sponsorship%20deck%20request`} className="btn btn-primary"><Download size={16} strokeWidth={2} /> Request the deck</a>
              )}
              <a href={`mailto:${event.contact.sponsorEmail}?subject=Sponsoring%20st(AI)rway`} className="btn btn-secondary"><Mail size={16} strokeWidth={2} /> Email us</a>
            </div>
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Final CTA headings in Anton**

In `components/sections/FinalCTA.tsx` change the two `<h2 id="cta-title" …>` classNames to:

```tsx
          <h2 id="cta-title" className="h-display text-[clamp(2.4rem,6vw,4.5rem)]" data-reveal>
```

(no-session variant) and

```tsx
          <h2 id="cta-title" className="h-display mt-4 text-[clamp(3rem,9vw,7.5rem)] leading-[0.92]" data-reveal>
```

- [ ] **Step 5: Gallery photos on cream mats**

In `components/sections/Gallery.tsx`, inside `GalleryGrid`, replace the item `<button …> … </button>` with:

```tsx
            <button
              onClick={() => setOpen(i)}
              className="lift block w-full border-2 border-ink bg-paper p-2 text-left shadow-hard"
              aria-label={`Open photo: ${g.caption}`}
            >
              <span className={cn("relative block overflow-hidden border-2 border-ink", ratioCls[g.ratio])}>
                <GalleryArt item={g} />
              </span>
              <span className="block px-1 pb-1 pt-2 text-sm font-medium">{g.caption}</span>
            </button>
```

- [ ] **Step 6: Search and newsletter inputs use the shared input skin**

In `components/sections/Resources.tsx` add `import { inputBase } from "@/components/ui/Field";` and `import { cn } from "@/lib/utils";`, and set the search input's className to:

```tsx
            className={cn("h-12 w-full pl-11 pr-4", inputBase)}
```

In `components/sections/Community.tsx` add `import { inputBase } from "@/components/ui/Field";` and `import { cn } from "@/lib/utils";`, and set the email input's className to:

```tsx
                className={cn("h-[52px] flex-1 px-4", inputBase)}
```

- [ ] **Step 7: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 8: Visual smoke check of the whole home page**

`stairway-dev`, `/` at 375 and 1280, scroll top to bottom. Expected order: hero (field) → ink ticker → About (paper) → spotlight (paper-2) → Societies (field) → Speakers (paper) → Leaderboard (paper-2) → Experience (paper) → Testimonials (field) → Gallery (paper, cream mats) → Resources (paper-2) → Perks (paper) → Team (paper-2) → Sponsors (paper, cobalt sponsor card) → FAQ (paper-2) → About IEEE (field) → yellow CTA → Community (paper) → cobalt footer. On every cobalt band, no ink text touches the cobalt (only cream text, yellow display words, or cream panels). The intermediate chips are sky blue, distinct from the cobalt. No horizontal scroll at 375.

- [ ] **Step 9: Commit**

```bash
git add components/sections/Testimonials.tsx components/sections/AboutIEEE.tsx components/sections/Sponsors.tsx components/sections/FinalCTA.tsx components/sections/Gallery.tsx components/sections/Resources.tsx components/sections/Community.tsx
git commit -m "feat(home): field testimonials and IEEE bands, sponsor field card, gallery mats" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Inner page headers, society pages, 404 and global error

**Files:**
- Create: `lib/design/title.ts`, `tests/design/title.test.ts`
- Modify: `components/ui/PageHero.tsx` (whole file), `app/s/[society]/page.tsx` (whole file), `app/not-found.tsx` (whole file), `app/global-error.tsx` (whole file)

**Interfaces:**
- Consumes: `FieldBand`, `ghostWord`, `GHOST_DEFAULT` (Task 3), `Heading` `tone` (Task 7), `TOKENS` (Task 1).
- Produces: `plainTitle(text: string): string` (strips `[[ ]]`), `displayTitleClass(text: string): string` (one of three literal Tailwind size classes), `PageHero({ eyebrow, title, lead?, ghost?: string | false })` — a compact cobalt header used by `/gallery`, `/resources`, `/privacy`, `/code-of-conduct`, `/login`, `/onboarding` and (Task 10) `/events/[slug]/register`.

- [ ] **Step 1: Write the failing title test**

Create `tests/design/title.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { displayTitleClass, plainTitle } from "@/lib/design/title";

describe("plainTitle", () => {
  it("drops the [[highlight]] markers", () => {
    expect(plainTitle("Every step, [[captured.]]")).toBe("Every step, captured.");
  });
});

describe("displayTitleClass", () => {
  it("steps the Anton size down for longer titles instead of clamping lines", () => {
    expect(displayTitleClass("Seeing Machines")).toBe("text-[clamp(2.6rem,7vw,5rem)]");
    expect(displayTitleClass("Agents that actually ship to production")).toBe("text-[clamp(2.2rem,5.4vw,3.8rem)]");
    expect(displayTitleClass("A".repeat(49))).toBe("text-[clamp(1.9rem,4.2vw,3rem)]");
  });
  it("measures the visible text, not the markers", () => {
    expect(displayTitleClass(`[[${"x".repeat(24)}]]`)).toBe("text-[clamp(2.6rem,7vw,5rem)]");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/design/title.test.ts`
Expected: FAIL — cannot resolve `@/lib/design/title`.

- [ ] **Step 3: Write the title helper**

Create `lib/design/title.ts`:

```ts
/** Visible text of a heading that may contain [[highlight]] markers. */
export const plainTitle = (text: string) => text.replace(/\[\[|\]\]/g, "");

/**
 * Anton display size for a page/event title. Long titles step down a size instead of being clamped to two lines,
 * so no words are ever hidden. Class strings are literal so Tailwind generates them.
 */
export function displayTitleClass(text: string): string {
  const n = plainTitle(text).trim().length;
  if (n <= 24) return "text-[clamp(2.6rem,7vw,5rem)]";
  if (n <= 48) return "text-[clamp(2.2rem,5.4vw,3.8rem)]";
  return "text-[clamp(1.9rem,4.2vw,3rem)]";
}
```

- [ ] **Step 4: Run the title test**

Run: `npx vitest run tests/design/title.test.ts`
Expected: PASS.

- [ ] **Step 5: Poster page header**

Replace `components/ui/PageHero.tsx` with:

```tsx
import { Heading } from "./Heading";
import { FieldBand } from "./Poster";
import { GHOST_DEFAULT } from "@/lib/design/ghost";
import { displayTitleClass } from "@/lib/design/title";
import { cn } from "@/lib/utils";

/** Compact poster header for inner pages: cobalt field, top corner band, ghost word, extruded Anton title. */
export function PageHero({ eyebrow, title, lead, ghost = GHOST_DEFAULT }: { eyebrow: string; title: string; lead?: string; ghost?: string | false }) {
  return (
    <FieldBand as="header" ghost={ghost} bands="top" className="mb-12 border-b-2 border-ink pb-12 pt-[clamp(72px,10vw,120px)] md:mb-16 md:pb-16">
      <div className="wrap">
        <p className="eyebrow mb-5" data-reveal>{eyebrow}</p>
        <Heading as="h1" text={title} tone="field" className={cn("h-display extrude max-w-[18ch] pt-[0.14em]", displayTitleClass(title))} />
        {lead && <p className="lead mt-6" data-reveal>{lead}</p>}
      </div>
    </FieldBand>
  );
}
```

- [ ] **Step 6: Society page header on the field**

Replace `app/s/[society]/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { Stairway } from "@/components/sections/Stairway";
import { FieldBand } from "@/components/ui/Poster";
import { SOCIETY_FILL } from "@/lib/events/colors";
import { ghostWord } from "@/lib/design/ghost";
import { displayTitleClass } from "@/lib/design/title";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/s/[society]">): Promise<Metadata> {
  const { society } = await params;
  const s = (await getSiteData()).societies.find((x) => x.slug === society);
  if (!s) return {};
  return { title: `${s.shortName} stairway`, description: s.description, alternates: { canonical: `/s/${s.slug}` } };
}

export default async function SocietyPage({ params }: PageProps<"/s/[society]">) {
  const { society } = await params;
  const { societies } = await getSiteData();
  const s = societies.find((x) => x.slug === society);
  if (!s) notFound();
  return (
    <>
      <FieldBand as="header" ghost={ghostWord({ kind: "general" })} bands="top" className="border-b-2 border-ink pb-12 pt-[clamp(72px,10vw,120px)]">
        <div className="wrap">
          <nav aria-label="Breadcrumb" className="mono mb-6 font-bold">
            <Link href="/" className="underline-offset-4 hover:underline">Home</Link> <span aria-hidden>/</span>{" "}
            <Link href="/#societies" className="underline-offset-4 hover:underline">Societies</Link> <span aria-hidden>/</span>{" "}
            <span aria-current="page">{s.shortName}</span>
          </nav>
          <span className={cn("inline-block border-2 border-ink px-3 py-1 font-mono font-bold text-ink shadow-[3px_3px_0_0_var(--ink)]", SOCIETY_FILL[s.color])}>{s.shortName}</span>
          <h1 className={cn("h-display extrude mt-5 max-w-[18ch] pt-[0.14em]", displayTitleClass(s.name))}>{s.name}</h1>
          <p className="lead mt-5">{s.description}</p>
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tracks">
            {s.tracks.map((t) => <li key={t.id} className="tag tag-outline">{t.name}</li>)}
          </ul>
        </div>
      </FieldBand>
      <Stairway societySlug={s.slug} title={`The ${s.shortName} [[stairway.]]`} />
    </>
  );
}
```

- [ ] **Step 7: 404 as a poster**

Replace `app/not-found.tsx` with:

```tsx
import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { FieldBand } from "@/components/ui/Poster";
import { ghostWord } from "@/lib/design/ghost";
import { TOKENS } from "@/lib/design/tokens";

export default function NotFound() {
  return (
    <FieldBand labelledBy="nf-title" ghost={ghostWord({ kind: "general" })} bands="top" className="border-b-2 border-ink py-[clamp(80px,12vw,140px)]">
      <div className="wrap grid items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="tag tag-red">Error 404 · Step not found</span>
          <h1 id="nf-title" className="h-display extrude mt-5 pt-[0.14em] text-[clamp(3rem,8vw,6rem)]">
            You fell off the <span className="text-yellow">stairway.</span>
          </h1>
          <p className="lead mt-6">The page you were climbing to doesn&apos;t exist — or it hasn&apos;t been built yet.</p>
          <Link href="/" className="btn btn-primary btn-lg mt-10">
            <ArrowUp size={18} strokeWidth={2} /> Climb back up
          </Link>
        </div>
        {/* a staircase with its top two steps knocked loose */}
        <svg viewBox="0 0 400 320" className="mx-auto w-full max-w-md" aria-hidden>
          {[0, 1, 2].map((i) => (
            <rect key={i} x={20 + i * 70} y={250 - i * 50} width="70" height={68 + i * 50} fill={i === 2 ? TOKENS.yellow : TOKENS.paper} stroke={TOKENS.ink} strokeWidth="3" />
          ))}
          <rect x="250" y="120" width="70" height="26" fill={TOKENS.red} stroke={TOKENS.ink} strokeWidth="3" transform="rotate(18 285 133)" />
          <rect x="300" y="190" width="70" height="26" fill={TOKENS.paper} stroke={TOKENS.ink} strokeWidth="3" transform="rotate(-24 335 203)" />
          <rect x="196" y="160" width="16" height="16" fill={TOKENS.blue} stroke={TOKENS.ink} strokeWidth="3" />
        </svg>
      </div>
    </FieldBand>
  );
}
```

- [ ] **Step 8: Self-contained global error on cobalt**

Replace `app/global-error.tsx` with:

```tsx
"use client";

import { TOKENS } from "@/lib/design/tokens";

/**
 * Last-resort fallback that replaces the root layout when it throws (for example
 * when the database is unreachable). It must stay self-contained: no site data,
 * no providers, no global stylesheet (only the token constants).
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: TOKENS.field,
          color: TOKENS.paper,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <title>st(AI)rway</title>
        <style>{`button:focus-visible{outline:3px solid ${TOKENS.yellow};outline-offset:3px}`}</style>
        <main style={{ maxWidth: 520, textAlign: "center", border: `6px solid ${TOKENS.paper}`, outline: `2px solid ${TOKENS.paper}`, outlineOffset: -14, padding: "44px 32px" }}>
          <p style={{ fontSize: "2rem", fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.03em" }}>
            st<span style={{ background: TOKENS.yellow, color: TOKENS.ink, padding: "0 0.08em" }}>(AI)</span>rway
          </p>
          <p style={{ fontSize: "1.15rem", lineHeight: 1.5, margin: "0 0 28px" }}>
            Something went wrong loading st(AI)rway. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              background: TOKENS.yellow,
              color: TOKENS.ink,
              border: `2px solid ${TOKENS.ink}`,
              boxShadow: `4px 4px 0 0 ${TOKENS.ink}`,
              padding: "12px 24px",
              minHeight: 48,
              fontSize: "1rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Visual smoke check**

`stairway-dev` at 375 and 1280: `/gallery`, `/resources`, `/privacy`, `/code-of-conduct`, `/login`, `/s/cs`, `/this-step-does-not-exist`. Each has a cobalt header with the top corner band, the faint CLIMB ghost, a cream extruded Anton title whose `[[marked]]` words are yellow, and cream lead text; the body below stays cream (prose box, gallery mats, login panel). Long titles stay readable at 375 (no clipping, no horizontal scroll).

- [ ] **Step 10: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/design/title.ts tests/design/title.test.ts components/ui/PageHero.tsx "app/s/[society]/page.tsx" app/not-found.tsx app/global-error.tsx
git commit -m "feat(pages): cobalt page headers, society header, poster 404 and global error" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Event pages (session header, step ghost words, registration page)

**Files:**
- Create: `tests/design/session-ghost.test.ts`
- Modify: `components/weekend/WeekendDetail.tsx` (imports, the `<header>` block, the action-rail panel class), `app/events/[slug]/register/page.tsx:4-14,129-133`

**Interfaces:**
- Consumes: `FieldBand`, `StairText`, `ghostWord` (Task 3), `displayTitleClass` (Task 9), `PageHero` `ghost` (Task 9), `.stair-num`, `.panel` (Task 2).
- Produces: event pages whose header is a cobalt band with ghost `STEP NN` (or `SUMMIT` on the finale) and a stair-stepped step number; the register page header uses the same ghost word.

- [ ] **Step 1: Write a guard test for the session ghost words on the real seed data**

Create `tests/design/session-ghost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ghostWord } from "@/lib/design/ghost";
import { EVENT_SOCIETY_MAP } from "@/supabase/seed-data/event-map";

describe("session ghost words for the seeded sessions", () => {
  const ghost = (slug: string) => {
    const e = EVENT_SOCIETY_MAP[slug];
    return ghostWord({ kind: "session", step: e.step, finale: !!e.finale });
  };

  it("labels ordinary sessions STEP NN", () => {
    expect(ghost("seeing-machines")).toMatch(/^STEP \d{2}$/);
  });

  it("labels the finale SUMMIT", () => {
    expect(ghost("the-summit")).toBe("SUMMIT");
  });

  it("never yields an empty or unpadded word for any seeded session", () => {
    for (const slug of Object.keys(EVENT_SOCIETY_MAP)) expect(ghost(slug)).toMatch(/^(STEP \d{2,}|SUMMIT)$/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/design/session-ghost.test.ts`
Expected: PASS already if `EVENT_SOCIETY_MAP` resolves (it guards Task 3's helper against the real data). If it FAILS because `@/supabase/seed-data/event-map` exports a different shape, read that file and adapt only the accessor in `ghost()` (keep the three assertions).

- [ ] **Step 3: Session header on the field**

In `components/weekend/WeekendDetail.tsx` add these imports:

```tsx
import { FieldBand } from "@/components/ui/Poster";
import { StairText } from "@/components/ui/Logo";
import { ghostWord } from "@/lib/design/ghost";
import { displayTitleClass } from "@/lib/design/title";
```

Replace the whole `<header className="pb-10 pt-10 md:pt-14"> … </header>` element (from that line through its closing `</header>`) with:

```tsx
      <FieldBand
        as="header"
        ghost={ghostWord({ kind: "session", step: w.step, finale: w.isFinale })}
        bands="top"
        className="border-b-2 border-ink pb-12 pt-[clamp(72px,10vw,120px)]"
      >
        <div className="wrap">
          <nav aria-label="Breadcrumb" className="mono mb-8 font-bold">
            <Link href="/" className="underline-offset-4 hover:underline">Home</Link> <span aria-hidden>/</span>{" "}
            <Link href={`/s/${w.society.slug}`} className="underline-offset-4 hover:underline">{w.society.shortName}</Link> <span aria-hidden>/</span>{" "}
            <span aria-current="page">Step {pad2(w.step)}</span>
          </nav>
          <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-end">
            <div className="panel grid w-40 justify-items-center gap-1 px-3 py-4 text-center md:w-48">
              <span className="mono font-bold" aria-hidden>{w.society.shortName} · Step</span>
              <StairText as="p" glyphs={pad2(w.step).split("")} label={`Step ${w.step} of ${stairway.length}`} className="stair-num" />
              <span className="mono font-bold text-ink-3" aria-hidden>/ {pad2(stairway.length)}</span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <span className={cn("tag", SOCIETY_FILL[w.society.color])}>{w.society.shortName}</span>
                <StatusChip status={w.status} />
                <LevelChip level={w.level} />
                {w.formats.map((f) => <FormatChip key={f} format={f} />)}
                {!done && (
                  <span className="tag tag-red"><Hourglass size={12} strokeWidth={2.5} aria-hidden /> {days === 0 ? "Today" : `In ${pad2(days)} days`}</span>
                )}
              </div>
              <h1 className={cn("h-display extrude mt-4 break-words pt-[0.14em]", displayTitleClass(w.title))}>{w.title}</h1>
              <p className="mono mt-3 text-sm font-bold">{w.topic}</p>
            </div>
          </div>
          <dl className="panel mt-10 grid sm:grid-cols-3">
            <div className="border-ink p-4 max-sm:border-b-2 sm:border-r-2">
              <dt className="meta-label text-blue-ink"><CalendarDays size={14} strokeWidth={2} aria-hidden /> When</dt>
              <dd className="mt-1">{longDate(w.start)}</dd>
            </div>
            <div className="border-ink p-4 max-sm:border-b-2 sm:border-r-2">
              <dt className="meta-label text-red-ink"><Clock size={14} strokeWidth={2} aria-hidden /> Time</dt>
              <dd className="mt-1">{timeOf(w.start)} – {timeOf(w.end)} IST</dd>
            </div>
            <div className="p-4">
              <dt className="meta-label text-purple-ink"><MapPin size={14} strokeWidth={2} aria-hidden /> Where</dt>
              <dd className="mt-1">{event.venue.hall}, {event.venue.name}</dd>
            </div>
          </dl>
        </div>
      </FieldBand>
```

- [ ] **Step 4: Climbed panel on cream (green-ink fails on paper-2)**

In the same file, change the action-rail panel's className:

```tsx
          <div className={cn("border-2 border-ink p-6 shadow-[6px_6px_0_0_var(--ink)]", done ? "bg-paper" : "bg-yellow")} data-reveal>
```

- [ ] **Step 5: Registration page header with the session ghost**

In `app/events/[slug]/register/page.tsx` add `import { ghostWord } from "@/lib/design/ghost";` and pass the ghost to the `PageHero` inside `page(...)`:

```tsx
      <PageHero
        eyebrow={`${ev.society.shortName} · Step ${pad2(ev.step)} · Registration`}
        title={ev.title}
        lead={`${longDate(ev.start)} · ${timeOf(ev.start)} – ${timeOf(ev.end)} IST`}
        ghost={ghostWord({ kind: "session", step: ev.step, finale: ev.isFinale })}
      />
```

- [ ] **Step 6: Visual smoke check**

`stairway-dev` at 375 and 1280: `/events/seeing-machines` (ghost `STEP NN`), `/events/the-summit` (ghost `SUMMIT`). The step number "0N" climbs in cobalt with an ink extrusion on its cream panel; the title is cream extruded Anton, fully visible (long titles wrap at a smaller size); chips are readable (the dashed format chip is cream-outlined on the field); the When/Time/Where strip is a cream panel. Below the header: the yellow action rail with the ink countdown cells, the "Climbed ✓" panel on cream for past sessions, the cream Who's going panel. `/events/seeing-machines/register` redirects signed-out visitors to `/login` (unchanged); signed in, its header shows the same ghost word and the form fields are white wells with the cobalt focus ring.

- [ ] **Step 7: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/design/session-ghost.test.ts components/weekend/WeekendDetail.tsx "app/events/[slug]/register/page.tsx"
git commit -m "feat(events): cobalt session header with STEP/SUMMIT ghost and stair-stepped step number" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Dashboards — cobalt chrome, cream sidebar and work panels

**Files:**
- Create: `tests/design/dashboard-shell.test.ts`
- Modify: `components/dashboard/DashboardShell.tsx` (whole file)

**Interfaces:**
- Consumes: `FieldBand` (Task 3), `.panel`, `.side-strip` (Task 2), `isNavActive` (`lib/dashboard/nav.ts`).
- Produces: `DashboardShell({ variant, children })` (unchanged API): a cobalt band (no ghost) holding a cream sidebar panel (Back to site first, cobalt strip, nav) and a cream work panel wrapping every `/me` page.

- [ ] **Step 1: Write the failing test**

Create `tests/design/dashboard-shell.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/me/tickets/0c5e1d0e-0000-4000-8000-000000000000",
}));

import { DashboardShell } from "@/components/dashboard/DashboardShell";

const out = renderToStaticMarkup(createElement(DashboardShell, { variant: "me", children: createElement("h1", null, "My tickets") }));

describe("DashboardShell", () => {
  it("keeps Back to site as the first control", () => {
    const first = /<(a|button)\b[^>]*>/.exec(out)?.[0] ?? "";
    expect(first).toContain('href="/"');
    expect(out.indexOf("Back to site")).toBeLessThan(out.indexOf("Overview"));
  });

  it("puts the chrome on the field and every page on a cream panel", () => {
    expect(out).toMatch(/^<div class="field on-field[^"]*">/);
    expect(out).toMatch(/<aside class="panel[^"]*">/);
    expect(out).toContain('<div class="panel min-w-0 p-5 md:p-8"><h1>My tickets</h1></div>');
    expect(out).not.toContain('class="ghost"');
  });

  it("marks My tickets as the current section on a ticket page", () => {
    const current = /<a[^>]*aria-current="page"[^>]*>/.exec(out)?.[0] ?? "";
    expect(current).toContain('href="/me/tickets"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/design/dashboard-shell.test.ts`
Expected: FAIL — the output starts with `<div class="wrap grid …">`, no `panel` classes.

- [ ] **Step 3: Rewrite `components/dashboard/DashboardShell.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LayoutDashboard, LogOut, Settings, Ticket, UserRound, type LucideIcon } from "lucide-react";
import { FieldBand } from "@/components/ui/Poster";
import { isNavActive } from "@/lib/dashboard/nav";
import { cn } from "@/lib/utils";

interface NavItem { href: string; label: string; Icon: LucideIcon; exact?: boolean }

// Nav config lives here (client side) so no component references cross the server/client boundary.
const NAV = {
  me: {
    title: "Your dashboard",
    items: [
      { href: "/me", label: "Overview", Icon: LayoutDashboard, exact: true },
      // Not exact: a single ticket (/me/tickets/<id>) keeps "My tickets" active.
      { href: "/me/tickets", label: "My tickets", Icon: Ticket },
      { href: "/me/profile", label: "Profile", Icon: UserRound },
      { href: "/me/settings", label: "Settings", Icon: Settings },
    ],
  },
} satisfies Record<string, { title: string; items: NavItem[] }>;

export type DashboardVariant = keyof typeof NAV;

const itemCls =
  "flex h-12 shrink-0 items-center gap-2 border-2 border-ink px-4 font-mono text-xs font-bold uppercase tracking-[0.12em] transition-colors";

/**
 * Dashboard layout: cobalt chrome around a cream sidebar panel and a cream work panel (dense tables and forms never
 * sit on the field). The first control in the sidebar always closes the dashboard (back to the site home).
 */
export function DashboardShell({ variant, children }: { variant: DashboardVariant; children: React.ReactNode }) {
  const pathname = usePathname();
  const { title, items } = NAV[variant];

  return (
    <FieldBand as="div" ghost={false} className="border-b-2 border-ink">
      <div className="wrap grid gap-6 py-8 md:py-12 lg:grid-cols-[240px_1fr] lg:gap-10">
        <aside className="panel p-3.5 lg:sticky lg:top-24 lg:self-start">
          <Link href="/" className="btn btn-sm btn-secondary mb-4 w-full justify-start shadow-[3px_3px_0_0_var(--ink)] lg:mb-5">
            <ArrowLeft size={16} strokeWidth={2} aria-hidden /> Back to site
          </Link>
          <div className="side-strip mb-3 hidden lg:block" aria-hidden="true" />
          <p className="mono mb-3 hidden font-bold text-ink-3 lg:block">{title}</p>
          <nav aria-label={title} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
            {items.map(({ href, label, Icon, exact }) => {
              const active = isNavActive(pathname, href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(itemCls, active ? "bg-yellow shadow-[3px_3px_0_0_var(--ink)]" : "bg-paper hover:bg-paper-3")}
                >
                  <Icon size={16} strokeWidth={2} aria-hidden /> {label}
                </Link>
              );
            })}
            <form action="/auth/signout" method="post" className="shrink-0 lg:mt-4">
              <button type="submit" className={cn(itemCls, "bg-paper hover:bg-red lg:w-full")}>
                <LogOut size={16} strokeWidth={2} aria-hidden /> Sign out
              </button>
            </form>
          </nav>
        </aside>
        <div className="panel min-w-0 p-5 md:p-8">{children}</div>
      </div>
    </FieldBand>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/design/dashboard-shell.test.ts`
Expected: PASS. (If `importOriginal` of `next/navigation` throws in the node environment, replace the factory with `() => ({ usePathname: () => "/me/tickets/0c5e1d0e-0000-4000-8000-000000000000" })` and keep the assertions.)

- [ ] **Step 5: Visual smoke check (signed in)**

Ask the user to sign in themselves in the Browser pane on the `stairway-dev` preview (never type credentials yourself). Then check `/me`, `/me/tickets`, `/me/profile`, `/me/settings` at 375 and 1280: cobalt band behind; the cream sidebar panel with "Back to site" first, the cobalt strip (≥1024px) and the yellow active item; at 375 the horizontal tab strip scrolls inside the panel; every page's heading, cards, forms and tables sit on the cream work panel; the sidebar stays sticky while scrolling at 1280 (proves `overflow: clip`). If the user is unavailable, defer this check to Task 14 and say so in the task report.

- [ ] **Step 6: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/design/dashboard-shell.test.ts components/dashboard/DashboardShell.tsx
git commit -m "feat(dashboard): cobalt chrome with cream sidebar and work panels" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Tickets — cobalt header, perforation, PNG colours from tokens

**Files:**
- Modify: `lib/tickets/layout.ts`, `lib/tickets/png.ts:1-3,21-24,44-62,85-96,107-112`, `components/tickets/TicketCard.tsx` (whole file), `components/tickets/NextTicketCard.tsx:9-11`, `tests/tickets/view.test.ts` (TicketCard block + new PNG colour block)

**Interfaces:**
- Consumes: `TOKENS` (Task 1), `contrastRatio` (Task 1), `.ticket-h`, `.perf` (Task 2).
- Produces: `QR_DARK = "#000000"`, `QR_LIGHT = "#ffffff"` (`lib/tickets/layout.ts`, shared by the SVG and the PNG); `PNG_COLORS = { ink, paper, yellow, field, qrDark, qrLight }` (`lib/tickets/png.ts`).

- [ ] **Step 1: Write the failing tests**

In `tests/tickets/view.test.ts`:
- add imports:

```ts
import { PNG_COLORS } from "@/lib/tickets/png";
import { contrastRatio } from "@/lib/design/contrast";
import { TOKENS } from "@/lib/design/tokens";
```

(merge `PNG_COLORS` into the existing `import { qrLayout, wrapText } from "@/lib/tickets/png";` line).
- in the TicketCard test "renders the QR with a quiet zone…", make the label lookup target the QR itself:

```ts
    const label = /<svg[^>]*aria-label="([^"]*)"/.exec(out)?.[1] ?? "";
```

- add inside `describe("TicketCard", …)`:

```ts
  it("has a cobalt header and a perforation, and keeps the QR black on white outside any field", () => {
    const out = html(card({}));
    expect(out).toContain('<header class="ticket-h">');
    expect(out).toContain('<span class="sr-only">st(AI)rway ticket</span>');
    expect(out).toContain('class="perf"');
    expect(out).toContain('fill="#ffffff"');
    expect(out).toContain('fill="#000000"');
    expect(out.indexOf('class="perf"')).toBeLessThan(out.indexOf("<svg"));
    expect(out).not.toMatch(/class="[^"]*\bfield\b/);
  });
```

- add a new block:

```ts
describe("ticket PNG colours", () => {
  it("takes the card colours from the tokens and keeps the QR pure black on white", () => {
    expect(PNG_COLORS).toEqual({
      ink: TOKENS.ink, paper: TOKENS.paper, yellow: TOKENS.yellow, field: TOKENS.field, qrDark: "#000000", qrLight: "#ffffff",
    });
  });

  it("keeps every text colour readable on its background (luminance contrast also holds in greyscale print)", () => {
    expect(contrastRatio(PNG_COLORS.paper, PNG_COLORS.field)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PNG_COLORS.ink, PNG_COLORS.yellow)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PNG_COLORS.ink, PNG_COLORS.paper)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(PNG_COLORS.qrDark, PNG_COLORS.qrLight)).toBeCloseTo(21, 5);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/tickets/view.test.ts`
Expected: FAIL — `PNG_COLORS` is not exported; no `ticket-h` header.

- [ ] **Step 3: Shared QR colours**

Append to `lib/tickets/layout.ts`:

```ts
/** QR colours for every renderer: pure black modules on a white quiet zone, never themed (scanners need the contrast). */
export const QR_DARK = "#000000";
export const QR_LIGHT = "#ffffff";
```

- [ ] **Step 4: PNG colours and the cobalt header strip**

In `lib/tickets/png.ts`:
- replace `import { QUIET_ZONE } from "./layout";` with:

```ts
import { TOKENS } from "@/lib/design/tokens";
import { QR_DARK, QR_LIGHT, QUIET_ZONE } from "./layout";
```

- replace the three colour constants (`INK`, `PAPER`, `YELLOW`) with:

```ts
/** Card colours from the design tokens; the QR stays pure black on white. No texture: it bloats the file and hurts scanning. */
export const PNG_COLORS = {
  ink: TOKENS.ink,
  paper: TOKENS.paper,
  yellow: TOKENS.yellow,
  field: TOKENS.field,
  qrDark: QR_DARK,
  qrLight: QR_LIGHT,
} as const;
const { ink: INK, paper: PAPER, yellow: YELLOW, field: FIELD } = PNG_COLORS;
const WORDMARK: [string, boolean][] = [["st", false], ["(AI)", true], ["rway", false]];
```

- replace the drawing code from `ctx.fillStyle = PAPER;` (first line after the `wrap` helper) through `for (const l of wrap(t.eyebrow.toUpperCase(), W - 192, 1)) ctx.fillText(l, 96, 236);` with:

```ts
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // Cobalt header strip with the cream wordmark ((AI) on its yellow block) and "TICKET".
  ctx.fillStyle = FIELD;
  ctx.fillRect(48, 48, W - 96, 120);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.beginPath();
  ctx.moveTo(48, 168);
  ctx.lineTo(W - 48, 168);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 60px ${SANS}`;
  let x = 96;
  for (const [part, block] of WORDMARK) {
    const w = ctx.measureText(part).width;
    if (block) {
      ctx.fillStyle = YELLOW;
      ctx.fillRect(x - 4, 76, w + 8, 68);
      ctx.fillStyle = INK;
    } else {
      ctx.fillStyle = PAPER;
    }
    ctx.fillText(part, x, 130);
    x += w + (block ? 8 : 0);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = PAPER;
  ctx.font = `bold 32px ${MONO}`;
  ctx.fillText("TICKET", W - 96, 126);

  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `bold 28px ${MONO}`;
  for (const l of wrap(t.eyebrow.toUpperCase(), W - 192, 1)) ctx.fillText(l, 96, 236);
```

- in the QR branch replace `ctx.fillStyle = "#ffffff";` with `ctx.fillStyle = QR_LIGHT;` and `ctx.fillStyle = "#000000";` with `ctx.fillStyle = QR_DARK;`; in the token branch replace `ctx.fillStyle = "#ffffff";` with `ctx.fillStyle = QR_LIGHT;`.

Run: `git grep -n '"#' -- lib/tickets/png.ts`
Expected: no output (every colour comes from `PNG_COLORS`/`QR_*`).

- [ ] **Step 5: The ticket card**

Replace `components/tickets/TicketCard.tsx` with:

```tsx
import { qrPath } from "@/lib/tickets/qr";
import { QR_DARK, QR_LIGHT } from "@/lib/tickets/layout";
import { QUIET_ZONE, type TicketCardData } from "@/lib/tickets/view";

export type { TicketCardData };

function QrSvg({ rows, title }: { rows: string[]; title: string }) {
  const n = rows.length;
  const q = QUIET_ZONE;
  return (
    <svg
      viewBox={`${-q} ${-q} ${n + 2 * q} ${n + 2 * q}`}
      width={248}
      height={248}
      role="img"
      aria-label={`QR code ticket for ${title}`}
      shapeRendering="crispEdges"
      className="block h-auto w-full max-w-[248px] border-2 border-ink bg-white"
    >
      <rect x={-q} y={-q} width={n + 2 * q} height={n + 2 * q} fill={QR_LIGHT} />
      <path d={qrPath(rows)} fill={QR_DARK} />
    </svg>
  );
}

/**
 * The ticket itself (server-rendered): cobalt header with the cream wordmark and diagonal band, a perforation, then
 * the door pass on cream. The QR encodes only the opaque ticket code (no personal data) and is always black on white.
 */
export function TicketCard({ t }: { t: TicketCardData }) {
  // Defence in depth: whatever the caller passes, only a confirmed seat ever shows a QR, code or token.
  const confirmed = t.status === "confirmed";
  return (
    <article className="box mx-auto w-full max-w-md shadow-[6px_6px_0_0_var(--ink)]" aria-labelledby="ticket-title">
      <header className="ticket-h">
        <span aria-hidden="true" className="relative z-[1] font-sans text-[1.35rem] font-semibold tracking-[-0.04em]">
          st<span className="mx-[0.04em] bg-yellow px-[0.08em] text-ink">(AI)</span>rway
        </span>
        <span aria-hidden="true" className="mono relative z-[1] mr-14 font-bold">Ticket</span>
        <span className="sr-only">st(AI)rway ticket</span>
      </header>
      <div className="grid gap-5 p-5">
        <div>
          <p className="mono font-bold text-ink-3">{t.eyebrow}</p>
          <h2 id="ticket-title" className="mt-1 break-words text-2xl font-semibold">{t.title}</h2>
        </div>
        <dl className="grid gap-2 text-sm">
          <div><dt className="mono text-ink-3">When</dt><dd>{t.when}</dd></div>
          <div><dt className="mono text-ink-3">Where</dt><dd>{t.venue}</dd></div>
          <div><dt className="mono text-ink-3">Name</dt><dd className="break-words font-semibold">{t.name}</dd></div>
        </dl>
      </div>
      <div className="perf" aria-hidden="true" />
      <div className="grid gap-5 p-5">
        {confirmed && t.pass.kind === "qr" && t.qrRows ? (
          <figure className="grid justify-items-center gap-2">
            <QrSvg rows={t.qrRows} title={t.title} />
            <figcaption className="grid justify-items-center gap-1 text-center">
              <span className="mono text-ink-3">Show this code at the door{t.token ? ` · ${t.token}` : ""}</span>
              {t.code && (
                <span className="font-mono text-xs break-all text-ink-2">
                  <span className="sr-only">Ticket code, if the scanner can&apos;t read the QR: </span>
                  {t.code}
                </span>
              )}
            </figcaption>
          </figure>
        ) : confirmed && t.pass.kind === "token" ? (
          <div className="border-2 border-ink bg-white p-5 text-center">
            <p className="mono text-ink-3">Your token</p>
            <p className="mt-2 break-all font-mono text-4xl font-bold tabular">{t.pass.token}</p>
            <p className="mt-2 text-sm text-ink-2">Say or show this token at the door.</p>
          </div>
        ) : t.status === "waitlisted" ? (
          <div className="border-2 border-ink bg-paper-2 p-5 text-center">
            <p className="mono">You&apos;re on the waitlist</p>
            {t.waitlistPosition != null && (
              <p className="mt-2 font-display text-5xl tabular">
                <span className="sr-only">Position </span>#{t.waitlistPosition}
              </p>
            )}
            <p className="mt-2 text-sm text-ink-2">
              This is not an entry ticket yet. If a seat frees up you move up automatically, and this page becomes
              your ticket. We don&apos;t send emails yet, so check back here.
            </p>
          </div>
        ) : (
          <div className="border-2 border-ink bg-paper-2 p-5 text-center">
            <p className="mono">Payment pending</p>
            <p className="mt-2 text-sm text-ink-2">This is not an entry ticket until the payment is confirmed.</p>
          </div>
        )}
        {t.checkedInAt && <p className="tag tag-green justify-self-start">Checked in</p>}
      </div>
    </article>
  );
}
```

- [ ] **Step 6: Cobalt header on the Overview's next-ticket card**

In `components/tickets/NextTicketCard.tsx` change the header strip:

```tsx
      <div className="border-b-2 border-ink bg-field px-5 py-3 text-paper">
```

(cream mono heading on cobalt, 6.86:1).

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/tickets`
Expected: PASS.

- [ ] **Step 8: Visual check of the ticket and its PNG (signed in)**

With the user signed in on the `stairway-dev` preview (they sign in themselves), open a confirmed ticket: cobalt header with the cream wordmark and the diagonal ink/cream band, dashed perforation with half-circle notches, QR black on white with a visible white quiet zone, "Download ticket (PNG)" works. Ask the user before downloading the PNG (state the filename `stairway-<slug>-ticket.png`); open the saved PNG with the Read tool: cobalt header strip, cream wordmark with the yellow (AI) block, black-on-white QR, no grain. If no signed-in session is available now, defer to Task 14 and say so in the report.

- [ ] **Step 9: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/tickets/layout.ts lib/tickets/png.ts components/tickets/TicketCard.tsx components/tickets/NextTicketCard.tsx tests/tickets/view.test.ts
git commit -m "feat(tickets): cobalt ticket header, perforation, PNG colours from tokens" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Brand assets — OG images, favicon, apple icon, manifest, theme colour

**Files:**
- Create: `lib/og-font.ts`, `tests/design/og.test.ts`, `tests/design/brand-assets.test.ts`
- Modify: `lib/og.tsx` (whole file), `app/opengraph-image.tsx` (whole file), `app/events/[slug]/opengraph-image.tsx` (whole file), `app/apple-icon.tsx` (whole file), `app/icon.svg` (whole file), `app/manifest.ts:15-16`, `app/layout.tsx` (viewport `themeColor`)

**Interfaces:**
- Consumes: `TOKENS` (Task 1), `FRAME_ORG` (Task 3), `pad2` (`lib/weekends.ts`), `getSiteData`.
- Produces: `ttfUrlFromCss(css: string): string | null`, `loadGoogleFont(family: string, text: string): Promise<ArrayBuffer | null>`, `ogFonts(text: { display: string; mono: string }): Promise<FontOptions[] | undefined>` (`lib/og-font.ts`); `ogSize`, `OG_DISPLAY = "Anton"`, `OG_MONO = "Space Mono"`, `ogAccent(finale: boolean): string`, `ogTitle(title: string, max?: number): string`, `OgFrame({ eyebrow: string; title: string | null; subtitle: string; accent?: string })` (`title: null` renders the stair wordmark) (`lib/og.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `tests/design/og.test.ts`:

```ts
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

  it("session: the title extruded as six ink copies under the cream face", () => {
    const out = html({ eyebrow: "CS · Step 04", title: "Seeing Machines", subtitle: "Computer vision" });
    expect(out.split("Seeing Machines").length - 1).toBe(7);
    expect(out).toContain(`background:${TOKENS.yellow}`);
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
```

Create `tests/design/brand-assets.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOKENS } from "@/lib/design/tokens";

// The old "paper brutalism" hexes that no longer exist in the palette (#F4EFE6 paper is unchanged and allowed).
const OLD = ["#FFB200", "#100F0D", "#2A8CFF", "#ECE4D7", "#E2D8C8", "#FF5A5A", "#1BE349", "#C07CFF", "#FF5C38", "#0B57C9", "#6B6355", "#4F4A40", "#3A352E"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|svg|css)$/.test(name) ? [p] : [];
  });
}

describe("brand assets", () => {
  it("draws the favicon with the Cobalt Circuit tokens", () => {
    const svg = readFileSync(join(process.cwd(), "app/icon.svg"), "utf8").toUpperCase();
    for (const hex of [TOKENS.field, TOKENS.ink, TOKENS.paper, TOKENS.yellow]) expect(svg).toContain(hex);
  });

  it("leaves no stale palette hex in app/, components/ or lib/", () => {
    const stale = ["app", "components", "lib"]
      .flatMap((d) => files(join(process.cwd(), d)))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8").toUpperCase();
        return OLD.filter((hex) => text.includes(hex)).map((hex) => `${f}: ${hex}`);
      });
    expect(stale).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/design/og.test.ts tests/design/brand-assets.test.ts`
Expected: FAIL — `ogAccent`/`ogTitle`/`@/lib/og-font` missing; stale hexes listed for `lib/og.tsx`, `app/icon.svg`, `app/apple-icon.tsx`, `app/events/[slug]/opengraph-image.tsx`.

- [ ] **Step 3: Font loader for next/og on Workers**

Create `lib/og-font.ts`:

```ts
import type { ImageResponse } from "next/og";

type OgFontList = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

/** The first TrueType/OpenType URL in a Google Fonts css2 response (Satori can't read woff2). */
export function ttfUrlFromCss(css: string): string | null {
  const m = /src:\s*url\(([^)]+)\)\s*format\(['"](?:opentype|truetype)['"]\)/.exec(css);
  return m ? m[1].replace(/^['"]|['"]$/g, "") : null;
}

/**
 * A Google font subset (only `text`'s glyphs) as TTF for next/og. Fetched inside the Worker at request time:
 * node:fs (the Next docs' readFile example) does not exist on Cloudflare. Null on any failure.
 */
export async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const src = ttfUrlFromCss(css);
    if (!src) return null;
    const res = await fetch(src);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Anton (display) + Space Mono 700 (labels), or undefined so the whole card uses the built-in font if either fails. */
export async function ogFonts(text: { display: string; mono: string }): Promise<OgFontList> {
  const [display, mono] = await Promise.all([loadGoogleFont("Anton", text.display), loadGoogleFont("Space Mono:wght@700", text.mono)]);
  if (!display || !mono) return undefined;
  return [
    { name: "Anton", data: display, weight: 400, style: "normal" },
    { name: "Space Mono", data: mono, weight: 700, style: "normal" },
  ];
}
```

- [ ] **Step 4: The cobalt OG frame**

Replace `lib/og.tsx` with:

```tsx
// Shared JSX for generated Open Graph images (rendered by next/og, i.e. Satori: every multi-child div is a flexbox).
import { FRAME_ORG } from "@/lib/design/brand";
import { TOKENS as T } from "@/lib/design/tokens";

export const ogSize = { width: 1200, height: 630 };
export const OG_DISPLAY = "Anton";
export const OG_MONO = "Space Mono";

const DEPTH = 6;
const GLYPHS = ["s", "t", "(AI)", "r", "w", "a", "y"];

/** Eyebrow chip colour: yellow; orange for the finale (the summit). */
export const ogAccent = (finale: boolean) => (finale ? T.orange : T.yellow);

/** Titles longer than `max` are cut at a word with an ellipsis (keeps the card to two title lines). */
export function ogTitle(title: string, max = 60): string {
  const t = title.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/** Satori's handling of long text-shadow lists is unverified: extrude with stacked ink copies under the cream face. */
function Extruded({ text, size, step, block = false }: { text: string; size: number; step: number; block?: boolean }) {
  const width = block ? { width: "100%" } : {};
  return (
    <div style={{ position: "relative", display: "flex", fontFamily: OG_DISPLAY, fontSize: size, lineHeight: 0.95, ...width, ...(block ? { textTransform: "uppercase" as const } : {}) }}>
      {Array.from({ length: DEPTH }, (_, i) => {
        const k = DEPTH - i;
        return (
          <div key={k} style={{ position: "absolute", left: k * step, top: -k * step, display: "flex", color: T.ink, ...width }}>
            {text}
          </div>
        );
      })}
      <div style={{ position: "relative", display: "flex", color: T.paper, ...width }}>{text}</div>
    </div>
  );
}

/** st(AI)rway in stair lettering: each glyph rises 0.1em; (AI) on its yellow block with an ink offset. */
function StairWordmarkOg({ size }: { size: number }) {
  const rise = size * 0.1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", paddingTop: rise * 6 + size * 0.14, fontFamily: OG_DISPLAY, fontSize: size, lineHeight: 0.9 }}>
      {GLYPHS.map((g, i) =>
        g === "(AI)" ? (
          <div
            key={g}
            style={{
              display: "flex",
              transform: `translateY(${-i * rise}px)`,
              background: T.yellow,
              color: T.ink,
              padding: `0 ${size * 0.07}px`,
              margin: `0 ${size * 0.04}px 0 ${size * 0.03}px`,
              boxShadow: `${size * 0.06}px ${-size * 0.06}px 0 ${T.ink}`,
            }}
          >
            {g}
          </div>
        ) : (
          <div key={`${g}${i}`} style={{ display: "flex", transform: `translateY(${-i * rise}px)` }}>
            <Extruded text={g} size={size} step={size * 0.02} />
          </div>
        ),
      )}
    </div>
  );
}

/** 1200×630 poster card: cobalt field, cream double frame, logo row, stair wordmark (home) or extruded title (session). */
export function OgFrame({ eyebrow, title, subtitle, accent = T.yellow }: { eyebrow: string; title: string | null; subtitle: string; accent?: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", padding: 28, background: T.field, color: T.paper, fontFamily: OG_MONO }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, border: `6px solid ${T.paper}`, padding: "30px 44px" }}>
        <div style={{ position: "absolute", top: 8, left: 8, right: 8, bottom: 8, display: "flex", border: `2px solid ${T.paper}` }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "2px solid rgba(244,239,230,0.35)" }}>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>{FRAME_ORG}</div>
          <div style={{ display: "flex", fontFamily: OG_DISPLAY, fontSize: 34, letterSpacing: 2 }}>IEEE</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {title === null ? <StairWordmarkOg size={150} /> : null}
          <div style={{ display: "flex", marginTop: title === null ? 18 : 0 }}>
            <div style={{ display: "flex", background: accent, color: T.ink, border: `3px solid ${T.ink}`, padding: "6px 14px", fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
              {eyebrow}
            </div>
          </div>
          {title !== null ? (
            <div style={{ display: "flex", marginTop: 34, maxWidth: 1000 }}>
              <Extruded text={title} size={84} step={2} block />
            </div>
          ) : null}
          {subtitle ? <div style={{ display: "flex", fontSize: 26, marginTop: 18 }}>{subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} style={{ width: 56, height: 10 + i * 5, marginRight: 8, border: `3px solid ${T.ink}`, background: i === 11 ? T.orange : i % 3 === 0 ? T.yellow : T.paper }} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: OG routes with fonts**

Replace `app/opengraph-image.tsx` with:

```tsx
import { ImageResponse } from "next/og";
import { FRAME_ORG } from "@/lib/design/brand";
import { OgFrame, ogSize } from "@/lib/og";
import { ogFonts } from "@/lib/og-font";

export const alt = "st(AI)rway — Weekend AI Event Series by IEEE SB CEK";
export const size = ogSize;
export const contentType = "image/png";

const EYEBROW = "Weekend AI event series";
const SUBTITLE = "Climb into AI · one weekend at a time";

export default async function Image() {
  return new ImageResponse(<OgFrame eyebrow={EYEBROW} title={null} subtitle={SUBTITLE} />, {
    ...size,
    fonts: await ogFonts({ display: "st(AI)rwayIEEE", mono: `${EYEBROW.toUpperCase()}${SUBTITLE}${FRAME_ORG}` }),
  });
}
```

Replace `app/events/[slug]/opengraph-image.tsx` with:

```tsx
import { ImageResponse } from "next/og";
import { getSiteData } from "@/lib/site/load";
import { pad2 } from "@/lib/weekends";
import { FRAME_ORG } from "@/lib/design/brand";
import { OgFrame, ogAccent, ogSize, ogTitle } from "@/lib/og";
import { ogFonts } from "@/lib/og-font";

export const alt = "st(AI)rway session";
export const size = ogSize;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { events } = await getSiteData();
  const ev = events.find((e) => e.slug === slug);
  const eyebrow = ev ? `${ev.society.shortName} · Step ${pad2(ev.step)}` : "st(AI)rway";
  const title = ogTitle(ev?.title ?? "Session");
  const subtitle = ev?.topic ?? "";
  return new ImageResponse(<OgFrame eyebrow={eyebrow} title={title} subtitle={subtitle} accent={ogAccent(!!ev?.isFinale)} />, {
    ...size,
    fonts: await ogFonts({ display: `${title.toUpperCase()}IEEE`, mono: `${eyebrow.toUpperCase()}${subtitle}${FRAME_ORG}` }),
  });
}
```

- [ ] **Step 6: Icons, manifest and theme colour**

Replace `app/icon.svg` with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="1" y="1" width="30" height="30" fill="#1C3FD0" stroke="#0B1026" stroke-width="2"/>
  <path d="M5 26 H12 V19 H19 V12 H26" fill="none" stroke="#F4EFE6" stroke-width="2.5"/>
  <rect x="21" y="5" width="7" height="7" fill="#FFC21A" stroke="#0B1026" stroke-width="2"/>
</svg>
```

Replace `app/apple-icon.tsx` with:

```tsx
import { ImageResponse } from "next/og";
import { TOKENS } from "@/lib/design/tokens";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** PNG app icon: the (AI) block on the cobalt field. Also used by the PWA manifest. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: TOKENS.field }}>
        <div
          style={{
            display: "flex",
            padding: "10px 16px",
            background: TOKENS.yellow,
            border: `6px solid ${TOKENS.ink}`,
            boxShadow: `8px 8px 0 0 ${TOKENS.ink}`,
            fontSize: 64,
            fontWeight: 800,
            color: TOKENS.ink,
            letterSpacing: -3,
          }}
        >
          (AI)
        </div>
      </div>
    ),
    size,
  );
}
```

In `app/manifest.ts` add `import { TOKENS } from "@/lib/design/tokens";` and set:

```ts
    background_color: TOKENS.paper,
    theme_color: TOKENS.ink,
```

In `app/layout.tsx` add `import { TOKENS } from "@/lib/design/tokens";` and set the viewport colour to the ink top bar:

```tsx
export const viewport: Viewport = {
  themeColor: TOKENS.ink,
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/design`
Expected: PASS (including "no stale palette hex").

- [ ] **Step 8: Check the images on workerd (OpenNext preview)**

Stop any running dev/preview servers first (`preview_stop`, and in PowerShell `Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process` if one is still alive) so nothing holds `.open-next`. Then run `npm run preview` in the background (it builds with OpenNext and serves on wrangler's local port, usually 8787; read the port from its output). Find the OG URLs from the HTML and save them:

```bash
mkdir -p .shots
curl -s http://localhost:8787/ | grep -o '<meta property="og:image" content="[^"]*"'
curl -s http://localhost:8787/events/the-summit | grep -o '<meta property="og:image" content="[^"]*"'
curl -s -o .shots/og-home.png "<home og:image URL>"
curl -s -o .shots/og-summit.png "<summit og:image URL>"
curl -s -o .shots/apple-icon.png http://localhost:8787/apple-icon
curl -s http://localhost:8787/manifest.webmanifest
```

Open both PNGs with the Read tool. Expected: cobalt card, cream double frame, `IEEE SB CE KIDANGOOR` row, Anton lettering (condensed, not the default font) — the stepped `st(AI)rway` on home; the summit card's title extruded with an **orange** eyebrow chip; cream/yellow/orange step bars. If the text is in the default font, the Worker could not fetch Google Fonts: check `wrangler` output for fetch errors; the fallback is acceptable to ship but report it. The manifest shows `"theme_color":"#0B1026"`. Also open `http://localhost:8787/` in the Browser pane and run `[...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family)` with `javascript_tool`: the next/font families for Urbanist and Anton (and Space Mono once a label renders) are loaded from `/_next/static/media/` on workerd, proving the self-hosted fonts survive the OpenNext build. Stop the preview afterwards.

- [ ] **Step 9: Run the checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/og.tsx lib/og-font.ts tests/design/og.test.ts tests/design/brand-assets.test.ts app/opengraph-image.tsx "app/events/[slug]/opengraph-image.tsx" app/apple-icon.tsx app/icon.svg app/manifest.ts app/layout.tsx
git commit -m "feat(brand): cobalt OG cards with Anton lettering, favicon, apple icon, ink theme colour" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Visual verification at 375 and 1280 (+ reduced motion, keyboard, signed-in pages)

**Files:**
- Create: `scripts/visual-check.mjs`
- Modify: `.gitignore` (add `.shots/`); any file a finding requires (fix wave)

**Interfaces:**
- Consumes: the whole restyled site; `.claude/launch.json` `stairway` (production server on 3123).
- Produces: `node scripts/visual-check.mjs [baseUrl] [outDir]` — full-page PNGs `<page>-<375|1280|375-reduced>.png` and a horizontal-overflow report (exit 1 on overflow).

- [ ] **Step 1: Write the screenshot script**

Create `scripts/visual-check.mjs`:

```js
// Usage: node scripts/visual-check.mjs [baseUrl=http://localhost:3123] [outDir=.shots]
// Full-page screenshots of every major page type at 375 (mobile) and 1280, plus a reduced-motion pass at 375.
// Prints a horizontal-overflow report and exits 1 if any page scrolls sideways.
// Needs Chrome: CHROME_PATH, default the Windows install path.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [base = "http://localhost:3123", outDir = ".shots"] = process.argv.slice(2);
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PAGES = [
  ["home", "/"],
  ["event", "/events/seeing-machines"],
  ["finale", "/events/the-summit"],
  ["register", "/events/seeing-machines/register"],
  ["society", "/s/cs"],
  ["gallery", "/gallery"],
  ["resources", "/resources"],
  ["privacy", "/privacy"],
  ["conduct", "/code-of-conduct"],
  ["login", "/login"],
  ["404", "/this-step-does-not-exist"],
];
const VIEWPORTS = [
  { name: "375", width: 375, height: 812, mobile: true, reduced: false },
  { name: "1280", width: 1280, height: 900, mobile: false, reduced: false },
  { name: "375-reduced", width: 375, height: 812, mobile: true, reduced: true },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "shots-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"],
  { stdio: "ignore" },
);
let overflow = 0;
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
    } catch {
      // Chrome is still starting
    }
  }
  if (!target) throw new Error("Chrome did not start (set CHROME_PATH)");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.result.value;

  await send("Page.enable");
  await send("Runtime.enable");
  for (const vp of VIEWPORTS) {
    const metrics = (height) => ({ width: vp.width, height, deviceScaleFactor: 1, mobile: vp.mobile });
    await send("Emulation.setDeviceMetricsOverride", metrics(vp.height));
    await send("Emulation.setTouchEmulationEnabled", { enabled: vp.mobile });
    await send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: "light" },
        { name: "prefers-reduced-motion", value: vp.reduced ? "reduce" : "no-preference" },
      ],
    });
    for (const [name, path] of PAGES) {
      await send("Page.navigate", { url: new URL(path, base).href });
      for (let i = 0; i < 50 && (await evaluate("document.readyState")) !== "complete"; i++) await sleep(200);
      await sleep(2500); // fonts, the stair climb-in, first reveals
      // reveal everything below the fold so full-page shots aren't blank
      await evaluate("document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in')), true");
      const [sw, sh] = JSON.parse(await evaluate("JSON.stringify([document.documentElement.scrollWidth, document.documentElement.scrollHeight])"));
      const bad = sw > vp.width;
      if (bad) overflow++;
      const landed = await evaluate("location.pathname");
      console.log(`${vp.name.padEnd(12)} ${name.padEnd(10)} scrollWidth=${sw}${bad ? "  HORIZONTAL OVERFLOW" : ""}  ${path} -> ${landed}`);
      await send("Emulation.setDeviceMetricsOverride", metrics(sh));
      await sleep(300);
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: vp.width, height: sh, scale: 1 } });
      writeFileSync(join(outDir, `${name}-${vp.name}.png`), Buffer.from(shot.result.data, "base64"));
      await send("Emulation.setDeviceMetricsOverride", metrics(vp.height));
    }
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold the profile on Windows; it lives in the temp dir
  }
}
console.log(overflow ? `${overflow} page(s) overflow horizontally` : "no horizontal overflow");
process.exit(overflow ? 1 : 0);
```

Append to `.gitignore`:

```
# visual-check screenshots
.shots/
```

- [ ] **Step 2: Build and serve production**

Stop any dev/preview server (`preview_stop`), then:

Run: `npm run build`
Expected: success.

Start the `stairway` preview (`preview_start` name `stairway`, port 3123).

- [ ] **Step 3: Run the screenshots**

Run: `node scripts/visual-check.mjs http://localhost:3123 .shots`
Expected: 33 lines (11 pages × 3 viewports), every `scrollWidth` equal to its viewport width, final line `no horizontal overflow`, exit code 0. `register` lands on `/login` (signed out) — that is correct.

- [ ] **Step 4: Review every screenshot against the mock-up**

Open each `.shots/*.png` with the Read tool (and `mockup-desktop-1280.png` / `mockup-mobile-375.png` from the designer's scratchpad for comparison). Checklist per page type:
- Home: hero = framed cobalt poster, stair lettering crisp and fully inside the frame at 375, ghost CLIMB faint (≤ .08), corner bands top and bottom; band rhythm as in Task 8 Step 8; no ink text directly on cobalt anywhere.
- Event / finale: ghost `STEP NN` / `SUMMIT`; stair-stepped step number; title readable; cream When/Time/Where panel.
- Society, gallery, resources, privacy, conduct, login, 404: cobalt page header with corner band and ghost; reading content on cream; gallery photos on cream mats.
- `375-reduced`: identical layout; the stair glyphs sit in their final stepped positions (no half-faded glyphs).
- Chips: green/sky/purple/orange/red each carry a word (and urgent ones an icon).

- [ ] **Step 5: Keyboard and focus pass (built-in browser)**

On the `stairway` preview at 1280: press Tab from the top of `/` — the skip link appears first; then the top bar (yellow ring on ink), the hero (yellow ring on cobalt), cream sections (ink ring), the dock (ink ring on cream), the footer (yellow ring on cobalt). Open a speaker card: the modal traps focus, Esc closes it, focus returns to the card. On `/login` the Google button shows the ink ring. Every ring is clearly visible (≥ 3:1 against what is behind it).

- [ ] **Step 6: Signed-in pages**

Ask the user to sign in themselves in the Browser pane (never type credentials). Screenshot at 375 and 1280: `/me`, `/me/tickets`, one ticket, `/me/profile` (trigger a validation error to see the red-ink 8px-left-border field and the "!" row), `/me/settings`, `/onboarding` if reachable. Confirm the dashboard chrome is cobalt with cream panels, Back to site is the first control, the sidebar stays sticky at 1280, and the QR is black on white. Download the ticket PNG only after the user approves (filename `stairway-<slug>-ticket.png`) and inspect it with the Read tool.

- [ ] **Step 7: Fix wave**

For every finding, fix it in the smallest file that owns it, rerun the affected screenshots, then:

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/visual-check.mjs .gitignore
git add -u
git commit -m "chore(design): visual check script and QA fixes at 375/1280" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(`git add -u` stages only the fix-wave edits to tracked files; screenshots stay ignored.)

---

### Task 15: Docs, final review, merge, deploy and live check

**Files:**
- Modify: `design-system/MASTER.md` (whole file), `README.md:7,150-158`, `.superpowers/sdd/progress.md` (append; git-ignored, never committed)

**Interfaces:**
- Consumes: everything above.
- Produces: merged `main`, a live deploy at https://stairway.ieeesbcek.workers.dev.

- [ ] **Step 1: Rewrite `design-system/MASTER.md`**

```markdown
# st(AI)rway — Design System (Master)

Source of truth for every page. Page-specific deviations go in `design-system/pages/<page>.md`.
Visual language: **poster brutalism ("Cobalt Circuit")** — the STEP '24 poster layer (cobalt field, cream double frame, extruded stair-step lettering, ghost word, diagonal corner bands, print grain) on top of paper brutalism (2px ink borders, hard offset shadows, square corners, flat colour chips, mono labels). Light only. Calm motion.

## Concept
"The Stairway": learning AI is a climb; every weekend is one step. The hero wordmark climbs one step per glyph. "(AI)" always sits on a yellow block with ink text.

## Tokens (`lib/design/tokens.ts` is the single TS source; `app/globals.css` mirrors it; `tests/design/tokens.test.ts` keeps them in sync)
| Token | Hex | Use |
|---|---|---|
| `field` / `field-2` | #1C3FD0 / #122C99 | poster field (hero, key bands, footer, ticket header, active dock item) / deeper variety |
| `paper` / `paper-2` / `paper-3` | #F4EFE6 / #E8E1D3 / #DCD3C2 | panels, frame, display type on the field / alternate bands / neutral tags, disabled fill |
| `ink` / `ink-2` / `ink-3` / `ink-4` | #0B1026 / #2A2F48 / #454A63 / #5A5F78 | text, borders, shadows, extrusion / secondary / muted / faint labels |
| `yellow` | #FFC21A | (AI) block, primary buttons, focus ring on the field and the top bar |
| `blue` (sky) `green` `purple` `orange` `red` | #6CC8FF #2EDB6A #C9A0FF #FF7A3D #FF5C5C | flat fills only, always with ink text |
| `blue-ink` (= field) `green-ink` `red-ink` `purple-ink` `amber-ink` | #1C3FD0 #0A7A2A #C31F1F #6B2FB5 #8A5A00 | coloured text on cream (green-ink on `paper` only) |
| `error-bg` | #FFF6F5 | invalid input background |

Meaning: green = climbed / beginner, sky = intermediate, purple = advanced, orange = summit, red = urgency and errors only, yellow = act here. Colour never stands alone: every chip has a word; urgent chips also an icon.

## The one hard rule
**No ink text on the field** (2.39:1). On cobalt, text is cream (6.86:1) or large yellow (4.86:1); ink is decoration only. Anything with ink text inside a field sits on a cream `.box` / `.box-2` / `.panel` (z-index 6, above the grain).

## The five signatures (`app/globals.css`, components in `components/ui/Poster.tsx` and `components/ui/Logo.tsx`)
1. **Field** `.field.on-field` (`FieldBand`): cobalt + print grain (`--noise`, `--blot`, soft-light overlays at z 5). `overflow: clip` keeps sticky children working.
2. **Ghost word** `.ghost` (`FieldBand ghost`): CLIMB on home and general pages, `STEP NN` on session pages, SUMMIT on the finale (`ghostWord()`); aria-hidden, opacity ≤ .08, never over photos or forms.
3. **Corner bands** `.bands.top` / `.bands.bottom`: hero gets both, other bands top only.
4. **Double frame** `.frame` + `.logo-row` (`Frame`, `LogoRow`): the row shows `FRAME_ORG` ("IEEE SB CE KIDANGOOR") as text until official cream logo SVGs exist.
5. **Extruded stair lettering** `.stair` (`StairWordmark`, `StairText`): one sr-only label, aria-hidden glyphs stepped by `--i`; `--extrude` is declared on `.stair, .extrude` (never `:root`). `.extrude` gives titles the same 10-layer extrusion without stepping.

## Pattern (event landing)
Hero (field poster) → ink topic ticker → about → next-step spotlight → **Societies (field)** → speakers + register prompt → leaderboard → experience → **testimonials (field)** → gallery → resources → perks → team → sponsors (field card) → FAQ → **About IEEE (field)** → yellow CTA band → newsletter → **footer (field)**. Cream bands alternate `paper` / `paper-2`. Field bands stay rare (≈1 in 3) so long pages stay readable.

## Typography (3 families via next/font)
Anton 400 (display: hero lettering, `.h2` section titles, `.h-display` page/event titles, countdown digits, step numbers) · Urbanist 300–700 (body 17px, card titles, the wordmark) · Space Mono 700 (labels, tags, buttons, captions; `.mono-wide` .3em tracking).
Section titles are rule headings: mono eyebrow + Anton `.h2` with a lead rule and a trailing rule (`SectionHeader`). On the field `[[marked]]` words turn yellow; on cream they sit on the yellow marker.

## Components
- **Buttons:** `.btn-primary` yellow · `.btn-secondary` cream · `.btn-ghost` transparent (cream outline on the field) · `.btn-ink` ink with a yellow shadow · disabled = paper-3, ink-4 text, dashed border, no shadow.
- **Tags:** 2px ink border on every chip; `.tag-field` (society), `.tag-cream`, `.tag-outline` dashed (waitlist/pending, cream-outlined on the field).
- **Cards:** cream, 2px ink, 6px shadow (8px on the field). `StepNumber`: Anton cobalt digits with a mini extrusion and three rising bars.
- **Countdown:** ink cells, cream Anton digits, yellow mono units; minute-level polite announcement only.
- **Seats:** cobalt fill with a faint cream hatch; low = red.
- **Forms** (`components/ui/Field.tsx`): white wells with a soft inset shadow, 3px cobalt focus ring, error = red-ink border with an 8px left edge on `error-bg` + a red "!" row; `aria-describedby` lists error then hint.
- **Navigation:** ink top bar (yellow focus); optional cobalt announcement strip. Floating dock on every screen size: cream tray, **active item cobalt with cream label**, Register yellow.
- **Dashboards** (`DashboardShell`): cobalt chrome, cream sidebar panel with **Back to site first**, cobalt strip, yellow active item; every page sits on a cream work panel. Mobile: horizontal tab strip.
- **Tickets** (`TicketCard`): cobalt header with the cream wordmark and diagonal band, dashed perforation with notches, QR **black on white with a 4-module quiet zone** (never on cobalt). PNG export takes its colours from the tokens, no texture.
- **Typed errors** (`ErrorPanel`): `role="alert"`, takes focus unless the fix is in the fields, ink text on a light red tint over cream, one recovery action.
- **Attendee lists:** "Who's going" panel; avatars only through `safeAvatarUrl()` with `referrerPolicy="no-referrer"`; signed-out visitors see the count only.

## Shape & elevation
Square corners only. Borders 2px ink. Hard offset shadows: 3–4px controls, 6px featured panels, 8px on the field and for modals. Hover lifts −2px with a 6px shadow; press sinks +3px (150ms).

## Motion (calm)
Stair lettering climbs in once (transform/opacity, 70ms stagger) only under `prefers-reduced-motion: no-preference`; otherwise it renders in place. Fade + 16px rise on scroll, once. Marquees pause on hover. Never animate `text-shadow`. No parallax, particles, tilt, custom cursor, loader or page wipes. Reduced motion: everything static, smooth scroll off.

## Interaction & a11y
- Touch targets ≥ 44px below 1024px; 8px+ gaps; `cursor: pointer` on every clickable.
- Focus ring: 3px `var(--focus)`, 3px offset — ink on cream; yellow in `.on-field`, the top bar and the footer; cobalt for inputs.
- Modals: focus trap, Esc, restore focus, 55% ink scrim. Accordions: `aria-expanded`, `inert` when closed.
- Forms: `Field`, visible mono labels, red `*` + `aria-required`, validate on blur, errors under fields, focus first invalid on submit.
- After client navigation, focus moves to `#main`. Skip link first.
- Print: fields lose their background, grain, ghost and bands; text turns ink.

## z-index scale
40 top bar · 50 dock · 60 modal · 70 toast · 80 skip link. Inside a field: 0 ghost · 1 bands · 2 content · 5 grain · 6 cream panels.
```

- [ ] **Step 2: Update `README.md`**

Line 7 becomes:

```markdown
Built with Next.js 16 (App Router, TypeScript), Tailwind CSS 4 and Lucide icons. The look is "Cobalt Circuit" poster brutalism: a cobalt poster field with a cream double frame and extruded stair-step lettering for heroes and key bands, cream panels with ink outlines and hard shadows for reading (see `design-system/MASTER.md`).
```

In "## 6. Design decisions" replace the first bullet, the "Colour carries meaning" bullet and the "Accessibility is designed in" bullet with:

```markdown
- **Poster brutalism, calm motion.** The hero is a framed cobalt poster: stair-step `st(AI)rway` lettering that climbs one step per glyph, a faint ghost word (CLIMB, STEP 04, SUMMIT), diagonal corner bands and a light print grain. Reading content, forms, dashboards and tickets stay on cream panels with 2px ink outlines and hard shadows. Motion is limited to the one-off stair climb-in, gentle fade-up reveals, a ticker and a blinking "next up" square.
- **Colour carries meaning.** Cobalt is the poster field, yellow means "act here" and holds the (AI) block, green means climbed or beginner, sky blue intermediate, purple advanced, orange the Summit and red urgency or errors only. Ink text never sits on cobalt. Every tag has a text label, so colour is never the only signal. Colours live in `lib/design/tokens.ts`, and a test checks every documented text/background pair against WCAG.
- **Accessibility is designed in.** There's a skip link, a 3px focus ring that turns yellow on cobalt, focus-trapped modals, semantic accordions, 44px touch targets, labelled forms that focus the first error, AA contrast throughout (tested), a polite minute-level countdown announcement, and a full reduced-motion mode in which the stair lettering renders in place.
```

- [ ] **Step 3: Commit the docs**

```bash
git add design-system/MASTER.md README.md
git commit -m "docs: Cobalt Circuit design system and README" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Final whole-branch review**

Use superpowers:requesting-code-review on `git merge-base main HEAD..HEAD` (the whole `restyle-cobalt` branch) with this spec and plan. Ask the reviewer to check specifically: no ink text on cobalt anywhere (grep for `text-ink` inside `FieldBand` children that are not in a `.box/.box-2/.panel`), every Global Constraint, the decisions table, QR rules, focus visibility, 44px targets, no `node:fs` in runtime code, no stale hexes, and that every existing test still asserts the same behaviour. Apply one fix wave for anything Critical/Important, re-run Task 14 Step 3 for touched pages.

- [ ] **Step 5: Full verification**

Run: `npx vitest run && npx tsc --noEmit && npx eslint . && npm run build`
Expected: all PASS.

- [ ] **Step 6: Merge (with the user's go-ahead)**

Use superpowers:finishing-a-development-branch. On "merge locally":

```bash
git checkout main && git pull --ff-only
git merge --no-ff restyle-cobalt -m "Merge restyle-cobalt: Cobalt Circuit poster restyle" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
npx vitest run
git push origin main
```

- [ ] **Step 7: Deploy**

Cloudflare's Git integration auto-builds `main` on push: watch the build in the Cloudflare dashboard (Workers → stairway → Deployments) until it is live. Fallback if the auto-build fails: stop every local dev/preview server (`preview_stop`; PowerShell `Get-Process workerd, node -ErrorAction SilentlyContinue` and stop any stale one holding `.open-next`), then:

```bash
CLOUDFLARE_ACCOUNT_ID=7a852bedf2056637d90bd9534e6cd7c1 npm run deploy
```

- [ ] **Step 8: Live check with the user**

Run: `node scripts/visual-check.mjs https://stairway.ieeesbcek.workers.dev .shots/live`
Expected: `no horizontal overflow`; review the home, event and 404 shots.

Then with the user on https://stairway.ieeesbcek.workers.dev: they sign in and confirm the dashboard, a ticket (QR scans from a phone), the PNG download, the hero at their phone size, and the link preview (paste a session link into WhatsApp or check the `og:image` URL directly: cobalt card with Anton lettering). Note any follow-ups.

- [ ] **Step 9: Record progress**

Append to `.superpowers/sdd/progress.md`:

```markdown
RESTYLE (Cobalt Circuit) MERGED + DEPLOYED (fill in the date):  branch restyle-cobalt, 15 tasks, plan docs/superpowers/plans/2026-10-09-cobalt-restyle.md. Follow-ups: official cream logo SVGs for LogoRow/OG (replace FRAME_ORG text), OG fonts fetched from Google at request time (consider bundling TTFs as Worker assets if previews are slow), plus the live-check notes from Step 8.
```

(This file is git-ignored by `.superpowers/sdd/.gitignore`: do not commit it.)

