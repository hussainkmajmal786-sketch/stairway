# st(AI)rway restyle spec: "Cobalt Circuit" poster brutalism

Status: design proposal (not implemented). References: `palette-options.html`, `mockup.html`, screenshots `*-desktop-1280.png` / `*-mobile-375.png` in this folder.

**Direction.** Keep the paper-brutalism system (2px ink borders, hard offset shadows, square corners, flat colour chips, mono labels). Add the STEP '24 poster layer on top: a saturated **cobalt field** as the dominant surface for the hero, section headers and alternate bands; a cream **double frame**; **extruded stair-step lettering**; a **ghost word**; **diagonal corner bands**; and light **grain**. Body copy never sits on the field. It stays on cream panels.

---

## 1. Palette: tokens (mostly a swap in `app/globals.css`)

| Token (existing name unless marked NEW) | Old | **New** | Use |
|---|---|---|---|
| `--field` **NEW** | n/a | **#1C3FD0** | dominant poster field: hero, field bands, ticket header, active dock item |
| `--field-2` **NEW** | n/a | **#122C99** | deeper field: band variety, hover on field, OG background gradient stop |
| `--paper` | #F4EFE6 | **#F4EFE6** (unchanged) | panels, frame, display type on field |
| `--paper-2` | #ECE4D7 | **#E8E1D3** | alternate bands, panel headers |
| `--paper-3` | #E2D8C8 | **#DCD3C2** | neutral tags, hover, disabled button fill |
| `--ink` | #100F0D | **#0B1026** (blue-black) | text, borders, shadows, extrusion |
| `--ink-2` | #3A352E | **#2A2F48** | secondary text |
| `--ink-3` | #4F4A40 | **#454A63** | muted labels |
| `--ink-4` | #6B6355 | **#5A5F78** | faint labels (5.49 on paper, 4.83 on paper-2) |
| `--yellow` | #FFB200 | **#FFC21A** | (AI) block, primary action, focus ring on field/ink |
| `--blue` | #2A8CFF | **#6CC8FF** (sky) | intermediate. Moved light so it never reads as the field |
| `--green` | #1BE349 | **#2EDB6A** | beginner / climbed / confirmed |
| `--purple` | #C07CFF | **#C9A0FF** | advanced |
| `--orange` | #FF5C38 | **#FF7A3D** | summit |
| `--red` | #FF5A5A | **#FF5C5C** | urgency, errors |
| `--blue-ink` | #0B57C9 | **#1C3FD0** (= field) | links / coloured text on cream |
| `--green-ink` `--red-ink` `--purple-ink` `--amber-ink` | | unchanged (#0A7A2A #C31F1F #6B2FB5 #8A5A00) | coloured text on cream |
| `--focus` **NEW** | n/a | `var(--ink)` on cream; `var(--yellow)` inside `.on-field`, top bar, footer | focus ring colour |

Add to `@theme inline`: `--color-field`, `--color-field-2`, `--font-display` → Anton. Shadows/borders stay `2px` / `4px` / `6px` ink.

**Semantic meaning is unchanged:** green = beginner/climbed, blue (now sky) = intermediate, purple = advanced, orange = summit, red = urgency/errors, yellow = act here + (AI). The one behaviour change: **the active dock item moves from red to cobalt** (`--field`, cream icon/label), so red is only ever urgency/error.

**Why cobalt.** IEEE-blue family without copying #00629B; the opposite of the red poster; yellow-on-blue is the pair protan/deutan viewers keep, so the (AI) block stays the loudest mark for everyone; cream on cobalt is 6.86:1, which is enough for 11px mono captions; chips sit on cream, so only "intermediate blue" needed a remap.

## 2. Typography (≤ 3 families)

| Role | Face | Spec |
|---|---|---|
| Display: hero stair lettering, section titles, "COMING SOON" rule heads, countdown digits, step numbers | **Anton** 400 (NEW, `next/font/google`, `display: swap`, subset latin) | hero `clamp(3.4rem, 16.5vw, 11.5rem)`, lh .9; `.h2` → `clamp(2.6rem, 7vw, 5rem)` uppercase, ls .01em; rule head `clamp(1.3rem, 6.4vw, 3.4rem)` nowrap |
| Body, card titles, wordmark in top bar | **Urbanist** 300–700 | body 17px/1.6; card title 600 `clamp(1.5rem, 2.6vw, 2rem)`; tagline 400 `clamp(1.15rem, 2.2vw, 1.55rem)` |
| Labels, tags, buttons, captions, handles | **Space Mono** 700 | .68–.8rem, uppercase, ls .12–.16em; poster caption `.mono-wide` ls .3em (clamped to .16em on phones) |

Anton is a condensed heavy grotesk. It matches the STEP '24 lettering and "COMING SOON" style and replaces Space Mono for `.h2` (Space Mono stays for every small label). The wordmark keeps its exact spelling `st(AI)rway`, and `(AI)` always sits on `--yellow`.

## 3. The five signature elements (CSS recipes)

### 3.1 Extruded stair-step lettering (hero `<h1>`, OG image, 404)
```html
<h1 class="stair" id="hero-title">
  <span class="sr-only">st(AI)rway</span>
  <span class="g" aria-hidden="true" style="--i:0">s</span><span class="g" aria-hidden="true" style="--i:1">t</span>
  <span class="g ai" aria-hidden="true" style="--i:2">(AI)</span>
  <span class="g" aria-hidden="true" style="--i:3">r</span>…<span class="g" aria-hidden="true" style="--i:6">y</span>
</h1>
```
```css
.stair { --step: .1em; --x: var(--ink);
  --extrude: .012em -.012em 0 var(--x), .024em -.024em 0 var(--x), .036em -.036em 0 var(--x), .048em -.048em 0 var(--x),
             .06em -.06em 0 var(--x), .072em -.072em 0 var(--x), .084em -.084em 0 var(--x), .096em -.096em 0 var(--x),
             .108em -.108em 0 var(--x), .12em -.12em 0 var(--x);
  font-family: var(--font-display); font-size: clamp(3.4rem, 16.5vw, 11.5rem); line-height: .9; color: var(--paper);
  display: flex; align-items: flex-end; padding-top: calc(var(--step) * 6 + .14em); }
.stair .g { display: inline-block; text-shadow: var(--extrude); transform: translateY(calc(var(--i) * var(--step) * -1)); }
.stair .ai { background: var(--yellow); color: var(--ink); padding: .02em .07em 0; margin: 0 .04em 0 .03em; text-shadow: none;
  box-shadow: .03em -.03em 0 var(--x), .06em -.06em 0 var(--x), .09em -.09em 0 var(--x), .12em -.12em 0 var(--x); }
@media (prefers-reduced-motion: no-preference) {
  .stair .g { animation: climb .7s var(--ease) both; animation-delay: calc(.08s + var(--i) * 70ms); }
  @keyframes climb { from { opacity: 0; transform: translateY(.35em); } to { opacity: 1; transform: translateY(calc(var(--i) * var(--step) * -1)); } }
}
```
Define `--extrude` **on `.stair`**, not on `:root`. A custom property resolves `var(--ink)` where it is declared. The single `sr-only` span gives screen readers one clean word; the glyph spans are `aria-hidden`. Make it a `<StairWordmark>` component next to `Wordmark` in `components/ui/Logo.tsx`. It replaces `.blur-in` on the hero. **Baseline caption:** `.stair-cap { white-space: nowrap; font-size: clamp(.56rem, 2.5vw, .78rem); letter-spacing: clamp(.16em, .6vw, .3em); transform: rotate(-5deg); transform-origin: 0 50% }`.

### 3.2 Double frame
```css
.frame { position: relative; z-index: 2; border: 6px solid var(--paper); outline: 2px solid var(--paper); outline-offset: -14px;
  padding: clamp(22px, 3.4vw, 44px) clamp(20px, 3.4vw, 48px); }
@media (max-width: 480px) { .frame { border-width: 5px; outline-offset: -11px; } }
.logo-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 2px solid rgb(244 239 230 / .35); }
```
The logo row holds the decorative diamond and the text `IEEE SB CE KIDANGOOR` (`FRAME_ORG`), plus an optional middle line (hidden <480px). **User decision (review of Tasks 1-4): there is no separate "IEEE" mark** — not in the logo row and not on the OG cards; the mock-up's right-hand `IEEE` placeholder is dropped. If the branch later supplies an official cream logo SVG, it replaces the row's text in one place (`LogoRow`).

### 3.3 Diagonal corner bands
```css
.bands { position: absolute; inset-inline: 0; height: clamp(44px, 9vw, 120px); z-index: 1; pointer-events: none; }
.bands.top    { top: 0;    background: linear-gradient(176deg, var(--paper) 0 30%, var(--ink) calc(30% + .5px) 62%, transparent calc(62% + .5px)); }
.bands.bottom { bottom: 0; background: linear-gradient(176deg, transparent 0 38%, var(--ink) calc(38% + .5px) 70%, var(--paper) calc(70% + .5px)); }
```
The hero gets both. Field section bands may use `.bands.top` only. The `+.5px` stops anti-alias seams. Ticket header variant: `linear-gradient(110deg, transparent 0 40%, var(--ink) 40% 60%, var(--paper) 60% 70%, transparent 70%)` on a 90px `::after`.

### 3.4 Ghost word
```css
.ghost { position: absolute; inset: -12% -25% auto; z-index: 0; transform: rotate(-7deg); pointer-events: none; user-select: none;
  font-family: var(--font-display); text-transform: uppercase; font-size: clamp(5rem, 15vw, 13rem); line-height: .86;
  color: var(--paper); opacity: .075; white-space: nowrap; }
.ghost span { display: block; } .ghost span:nth-child(even) { margin-left: -.6em; opacity: .7; }
```
Always `aria-hidden="true"`. Words: hero "CLIMB", dashboard "TICKET", gallery "SNAP", FAQ "ASK", 404 "LOST". Keep opacity ≤ .08 so cream text on top stays ≥ 6:1. In the worst case the effective field under text lightens from #1C3FD0 to about #2E4FD3, and cream stays at 6.2:1.

### 3.5 Distressed texture
```css
--noise: url("data:image/svg+xml,…feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'…");  /* 220px tile */
--blot:  url("data:image/svg+xml,…feTurbulence baseFrequency='.012' numOctaves='3' seed='7'…");                                  /* 600px tile */
.field { position: relative; isolation: isolate; background: var(--field); overflow: hidden; }
.field::before, .field::after { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 5; mix-blend-mode: soft-light; }
.field::before { background-image: var(--noise); opacity: .32; }
.field::after  { background-image: var(--blot); background-size: 600px; opacity: .14; }
```
Copy the full data URIs from `mockup.html`. The overlays sit above content (`z-index: 5`), so they also grain the frame and type like print. `soft-light` at these opacities moves text contrast by less than 0.3. Panels inside `.field` set `position: relative; z-index: 6` when they must stay perfectly clean (forms, QR).

## 4. Component changes

| Component | Change |
|---|---|
| **TopBar** (`components/layout/TopBar.tsx`) | `bg-ink text-paper`, `--focus: yellow`. `StairMark` gets a cobalt square, cream stair line and yellow block (new props or an `onDark` variant). "Next · Step 04" button: cream fill, cream border, `3px 3px 0 yellow` shadow. `AnnouncementBar` stays ink and gets a cobalt variant for "registrations open". |
| **Dock** | Cream tray, ink border, ink shadow as now. **Active item `bg-field text-paper`** (was `bg-red`). Register stays yellow. |
| **Hero** | Wrap in `.field.on-field` + `.bands` + `.ghost` + `.frame`. `StairWordmark` h1 + rotated mono caption. Tagline in cream. CTAs: primary yellow, secondary becomes `btn-ghost` (cream outline on field). Add a rule head "STEP 04 OPENS SAT 18 OCT" (from `next`) with a yellow verb and a handles row. Move the next-step panel just below the hero (first paper band) or keep it inside the frame on ≥1024px. The stats strip stays as an ink-bordered strip under the bands. |
| **Section headers** | `.h2` → Anton uppercase with `.rule-h.left` (28px lead rule + flexible trailing rule). Mono eyebrow `NN · Section`. On field bands the heading is cream; on paper it is ink. |
| **Bands rhythm** (home) | hero (field) → ticker (ink) → about (paper) → next step (paper-2) → stairway list (**field**) → tracks/quiz (paper) → speakers (paper-2) → register prompt (**field**, framed) → proof (paper) → … → yellow CTA band (unchanged) → footer (ink). At most 1 field band per 3 sections, so long pages stay readable. |
| **Cards** (`.box`, event/session cards) | Cream, 2px ink, `6px` shadow (`8px` on field). Step number: Anton in `--field` with `.04em -.04em 0 ink` mini-extrusion and three rising ink bars. Countdown cells: ink fill, cream Anton digits, yellow mono units. Seats fill: `--field` with faint cream hatch; `data-tone="low"` stays `--red`. |
| **Buttons** | `.btn` default fill → paper. `.btn-primary` yellow. `.btn-ghost` → transparent + no shadow (cream border/text inside `.on-field`). `.btn-ink` unchanged (yellow shadow). **Disabled:** paper-3 fill, ink-4 text, *dashed* border, no shadow (not opacity .5, which failed contrast on field). |
| **Chips/tags** | Add a 2px ink border to all `.tag` (chips now sit on cream and on field). New `.tag-field` (cobalt/cream) for society tags and `.tag-cream`. `.tag-outline` → dashed border (waitlist / pending). |
| **Forms** (`components/ui/Field.tsx`) | Inputs on white with an inset 3px soft shadow. Focus ring 3px `--field`. Error: `border-color: red-ink; border-left-width: 8px; background: #FFF6F5` + message row with a red "!" square. `aria-invalid`, `aria-describedby` = error + hint. |
| **Dashboards** (`DashboardShell`) | Page body on a `.field` band with a cream sidebar panel. "Back to site" stays the **first** control (cream btn). Active nav = yellow + 3px ink shadow (unchanged); sign-out hover red. On mobile the horizontal tab strip stays. Content panels are cream. |
| **Tickets** (`TicketCard.tsx`) | Header `bg-field` with the cream wordmark (yellow `(AI)`) and diagonal band `::after`. Perforation divider (dashed 2px ink + half-circle notches). QR stays black on **white** with the 4-module quiet zone. "Confirmed" green chip; "Save PNG" = `btn-ink`. |
| **PNG export** (`lib/tickets/png.ts`) | `INK = "#0b1026"`, `PAPER = "#f4efe6"`, `YELLOW = "#ffc21a"`, add `FIELD = "#1c3fd0"` for the header strip with cream text. Keep the QR `#ffffff`/`#000000`. No texture in PNGs: it adds file size and hurts scanning. Greyscale print check: the header becomes dark grey and cream text stays legible. |
| **OG images** (`lib/og.tsx`, used by `app/opengraph-image.tsx` and `app/events/[slug]/opengraph-image.tsx`) | Background `#1C3FD0`; cream frame (6px border + inner 2px inset); cream Anton title with stepped glyphs. Satori's `textShadow` support is limited and its handling of 10-layer shadow lists is unverified, so render the extrusion the safe way: 6 stacked, absolutely positioned ink copies of each glyph offset by `k*2px, -k*2px`, then the cream face on top. (AI) yellow block. Load Anton TTF in the route. `accent` prop: yellow default, finale stays orange `#FF7A3D`. The step bars at the bottom: cream/yellow/orange on cobalt. |
| **Favicon** `app/icon.svg` | `rect fill="#1C3FD0" stroke="#0B1026"`, stair path `stroke="#F4EFE6"`, block `fill="#FFC21A"`. |
| **Manifest / viewport** | `app/manifest.ts`: `theme_color: "#0B1026"` (matches the ink top bar), `background_color: "#F4EFE6"`. `app/layout.tsx` `viewport.themeColor: "#0B1026"`. |
| **Selection / skip link** | `::selection` yellow on ink (unchanged). Skip link unchanged. |
| **Focus** | `:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px }`. `.on-field`, `.topbar`, footer and `.btn-ink` contexts set `--focus: var(--yellow)`. Replaces the global `blue-ink` ring, which would vanish on cobalt (2.4:1). |

## 5. Accessibility and contrast (WCAG 2.x, computed)

| Pair | Ratio | Result |
|---|---|---|
| Ink #0B1026 on cream #F4EFE6 (body) | 16.43 | AAA |
| Ink-3 #454A63 on cream / cream-2 | 7.60 / 6.69 | AAA / AA |
| Ink-4 #5A5F78 on cream / cream-2 | 5.49 / 4.83 | AA |
| Cream on field #1C3FD0 (tagline, mono captions, handles) | 6.86 | AA (small) |
| Cream on field-2 #122C99 | 9.93 | AAA |
| Yellow #FFC21A on field (large display "OPENS", focus ring) | 4.86 | AA |
| Ink on yellow (primary button, (AI)) | 11.63 | AAA |
| Cream on ink (ink button, top bar) / yellow on ink | 16.43 / 11.63 | AAA |
| Field colour as link text on cream | 6.86 | AA |
| Chips (ink on): green / sky / purple / orange / red | 10.26 / 10.16 / 8.92 / 7.26 / 6.21 | AAA…AA |
| red-ink on cream / on error input #FFF6F5 | 5.19 / 5.59 | AA |
| Focus: ink ring on cream / yellow ring on field | 16.43 / 4.86 | ≥3 ✓ |
| Frame/panel boundary: cream vs field | 6.86 | ≥3 ✓ |
| **Ink on field** | **2.39** | **FAIL → never put ink type on the field** (ink is decoration there only: extrusion, bands, shadows) |
| Disabled btn: ink-4 on paper-3 | 4.23 | exempt; dashed border also signals the state |

The rest follows the current MASTER rules. Colour never stands alone: every chip has a word, and urgency chips get an icon. Under deuteranopia simulation, green, orange and red chips converge to olive (see `palette-options.html`), so **labels and icons are mandatory** for beginner / summit / urgent. Touch targets stay ≥44px. Reduced motion keeps the stair lettering static (it renders in final position because the animation is gated by `no-preference`). The countdown updates text only: the visual cells are `aria-hidden`, and an sr-only `role="timer"` element carries minute-level text with an explicit `aria-live="polite"` (a bare timer is `aria-live="off"`, so nothing would ever be announced), giving at most one polite update a minute and never one per tick.

## 6. Performance notes
- Texture: two inline-SVG data URIs (~0.6 KB each), rasterised once per tile. Apply them only to `.field` sections (absolute overlays), **never to `position: fixed` full-page layers**, which forces repaints on scroll on low-end Android. `mix-blend-mode` creates a stacking context per section, which is fine at ≤ 5 field bands per page. If profiling shows jank on low-end phones, pre-render `noise.png` (220px, ~15 KB, ≤ 4 bit grey) and drop the blend for `opacity` only.
- Extrusion: 10 text-shadows × 7 glyphs, rendered once. Do not animate `text-shadow`; the entrance animates only `transform`/`opacity`.
- Fonts: add Anton (one weight, ~20 KB woff2 latin) through `next/font/google` with `display: swap` and `adjustFontFallback`. Total stays at 3 families. Preload only Urbanist + Anton.
- Ghost words are real text (cheap) and `aria-hidden`. Avoid SVG `feDisplacementMap` warping in live pages (expensive). The poster's warp can come later in a pre-rendered SVG if wanted.

## 7. Rollout checklist (page by page) and risks

1. **Tokens + fonts** (`globals.css`, `layout.tsx`): swap hexes, add `--field*`, `--focus`, Anton, new utilities (`.field`, `.on-field`, `.frame`, `.bands`, `.ghost`, `.stair`, `.rule-h`, `.tag-field`). *Risk:* `--blue` usages that mean "brand blue" rather than "intermediate". Grep for `bg-blue`/`text-blue-ink` and recheck each.
2. **Logo** (`Logo.tsx`): `StairWordmark`, `StairMark` dark variant. Keep `Wordmark` API.
3. **TopBar + Dock + Footer.** *Risk:* the active dock colour change (red → field) must also update any tests or snapshots that assert `bg-red`.
4. **Home hero** + stats strip. *Risk:* text on texture. The tagline is 1.15rem+ cream on field (6.86 before grain; verified ≥6.2 with ghost + grain). Never place mono below 11px on the field.
5. **Section headers + band rhythm** across home sections (ticker, about, stairway list, tracks, speakers, proof, resources, perks, team, sponsors, FAQ, IEEE, CTA band, newsletter). *Risk:* the stairway list moving onto the field. Its rows must become cream cards (no ink text directly on cobalt).
6. **Event pages** `/events/[slug]` + `/events/[slug]/register`: hero becomes a compact framed field header (stair lettering at ~60% scale using the event title in Anton, no per-glyph stepping for long titles: step only the step number). *Risk:* long titles wrapping in Anton. Cap at 2 lines and clamp `font-size`.
7. **Society pages** `/s/*`: field band header, `tag-field` society chip.
8. **Gallery**: images on cream mats with ink borders. The ghost word sits only in the header, not over photos.
9. **Dashboard** `/me/*`: field page background, cream panels, Back to site first. *Risk:* dense tables on the field. Always wrap them in a cream panel.
10. **Tickets** page + `lib/tickets/png.ts` + print CSS (`@media print { .field { background: none; } .field::before, .field::after { display: none } }`). *Risk:* QR scan contrast. Keep white quiet zone + black modules, no texture over QR (z-index 6 panel).
11. **Forms / ErrorPanel / modals / toasts**: error recipe, dashed disabled state, focus tokens. *Risk:* `ErrorPanel` taking focus. Its red-ink text must sit on cream, not on the field.
12. **OG images, favicon, manifest, theme-color.** *Risk:* the Satori extrusion recipe (stacked copies), and Anton TTF must be fetched at build/runtime.
13. **Update `design-system/MASTER.md`**: rename "paper brutalism" to "poster brutalism (Cobalt Circuit)", add the 5 signatures, the band rhythm, the "no ink type on field" rule and the focus token.
14. **QA pass** at 320 / 375 / 768 / 1280: horizontal overflow (stair lettering at 320px → `16.5vw` = 53px, fits), reduced motion, keyboard focus visibility on every surface, greyscale screenshot of a ticket PNG, Lighthouse CLS (Anton swap: set `size-adjust` fallback).

## 8. Open questions
- Official IEEE SB CEK / IEEE Kerala logo SVGs (white/cream versions) for the frame's logo row: who supplies them, and are IEEE master-brand usage rules OK with a cream mono version on cobalt?
- Ghost word per page: "CLIMB" on home is proposed. Does the team want event-specific words (e.g. "HACK" for the 24-hour finale)?
- Should the finale/Summit event keep an **orange** variant of the field (#FF7A3D frame accents on cobalt), or a full orange field for that one page?
