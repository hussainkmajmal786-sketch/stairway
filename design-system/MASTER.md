# st(AI)rway — Design System (Master)

Source of truth for every page. Page-specific deviations go in `design-system/pages/<page>.md`.
Visual language: **poster brutalism ("Cobalt Circuit")** — the STEP '24 poster layer (cobalt field, cream double frame, extruded stair-step lettering, ghost word, diagonal corner bands, print grain) on top of paper brutalism (2px ink borders, hard offset shadows, square corners, flat colour chips, mono labels). Light only. Calm motion.

## Concept
"The Stairway": learning AI is a climb; every weekend is one step. The hero wordmark climbs one step per glyph. "(AI)" always sits on a yellow block with ink text.

## Tokens
`lib/design/tokens.ts` is the single TS source (ticket PNG, OG images, icons, manifest, inline SVG). `app/globals.css` `:root` mirrors it. `tests/design/tokens.test.ts` keeps the two in sync, and the contrast guard tests check every documented text/background pair (`CONTRAST_PAIRS`) against its WCAG minimum and prove the forbidden pairs (`FORBIDDEN_PAIRS`) really fail.

| Token | Hex | Use |
|---|---|---|
| `field` / `field-2` | #1C3FD0 / #122C99 | poster field (hero, key bands, footer, ticket header, active dock item) / deeper variety |
| `paper` / `paper-2` / `paper-3` | #F4EFE6 / #E8E1D3 / #DCD3C2 | panels, frame, display type on the field / alternate bands / neutral tags, disabled fill |
| `ink` / `ink-2` / `ink-3` / `ink-4` | #0B1026 / #2A2F48 / #454A63 / #5A5F78 | text, borders, shadows, extrusion / secondary / muted / faint labels |
| `yellow` | #FFC21A | (AI) block, primary buttons, focus ring on the field and the top bar |
| `blue` (sky) `green` `purple` `orange` `red` | #6CC8FF #2EDB6A #C9A0FF #FF7A3D #FF5C5C | flat fills only, always with ink text |
| `blue-ink` (= field) `green-ink` `red-ink` `purple-ink` `amber-ink` | #1C3FD0 #0A7A2A #C31F1F #6B2FB5 #8A5A00 | coloured text on cream (green-ink on `paper` only) |
| `error-bg` | #FFF6F5 | invalid input background |
| `--focus` | `ink` (yellow in `.on-field`, the top bar, the footer) | focus ring colour |

Meaning: green = climbed / beginner, sky = intermediate, purple = advanced, orange = summit, red = urgency and errors only, yellow = act here. Colour never stands alone: every chip has a word; urgent chips also an icon. `theme-color` is ink (#0B1026, `viewport.themeColor` in `app/layout.tsx`).

## The one hard rule
**No ink text on the field** (2.39:1). On cobalt, text is cream (6.86:1) or large yellow (4.86:1); ink is decoration only. Blue sections are for display and short copy; long reading, forms, tables and dashboards sit on cream. Anything with ink text inside a field sits on a cream `.box` / `.box-2` / `.panel` (z-index 6, above the grain).

## The five signatures (`app/globals.css`; components in `components/ui/Poster.tsx` and `components/ui/Logo.tsx`)
1. **Field** `.field.on-field` (`FieldBand`): cobalt + print grain (`--noise`, `--blot`, soft-light overlays at z 5). `overflow: clip` keeps sticky children working.
2. **Ghost word** `.ghost` (`FieldBand ghost`, `Ghost`): `ghostWord()` in `lib/design/ghost.ts` picks it. CLIMB on home, general pages and the 404; `STEP NN` on session pages; SUMMIT on the finale. aria-hidden, opacity .075, never over photos or forms.
3. **Corner bands** `.bands.top` / `.bands.bottom`: hero gets both, other bands top only.
4. **Double frame** `.frame` + `.logo-row` (`Frame`, `LogoRow`): the row shows only the text `FRAME_ORG` ("IEEE SB CE KIDANGOOR", `lib/design/brand.ts`); there is no IEEE mark until official cream logo SVGs exist (then replace `LogoRow`'s body and the OG frame's top row).
5. **Extruded stair lettering** `.stair` (`StairWordmark`, `StairText`): one sr-only label, aria-hidden glyphs stepped by `--i`; `--extrude` is declared on `.stair, .extrude` (never `:root`). `.extrude` gives titles the same 10-layer extrusion without stepping.

Other helpers in `lib/design/`: `contrast.ts` (WCAG maths for the tests), `dock.ts` (dock item classes), `hero.ts`, `marks.ts`, `title.ts` (display title size steps down for long titles, never clamps to two lines).

## Pattern (event landing)
Hero (field poster) → ink topic ticker → about → next-step spotlight → **Societies (field)** → speakers + register prompt → leaderboard → experience → **testimonials (field)** → gallery → resources → perks → team → sponsors (cream band with a field card) → FAQ → **About IEEE (field)** → yellow CTA band → newsletter/community → **footer (field)**. Cream bands alternate `paper` / `paper-2`. Field bands stay rare (about 1 in 3) so long pages stay readable. Event pages open with a field header (`WeekendDetail`); general pages use `PageHero`.

## Typography (3 families via next/font)
Anton 400 (display: hero lettering, `.h2` section titles, `.h-display` page/event titles, countdown digits, step numbers) · Urbanist 300–700 (body 17px, card titles, the wordmark) · Space Mono 700 (labels, tags, buttons, captions; `.mono-wide` .3em tracking). Anton and Urbanist are preloaded; Space Mono is not (labels only).
Section titles are rule headings: mono eyebrow + Anton `.h2` with a lead rule and a trailing rule (`SectionHeader`). On the field `[[marked]]` words turn yellow; on cream they sit on the yellow marker.

## Components
- **Buttons:** `.btn-primary` yellow · `.btn-secondary` cream (renamed from the old `.btn-paper`) · `.btn-ghost` transparent (cream outline on the field) · `.btn-ink` ink with a yellow shadow · disabled = paper-3 fill, ink-4 text, **dashed** border, no shadow (on the bare field: transparent with a cream dashed outline; opacity .5 failed contrast).
- **Tags:** 2px ink border on every chip; `.tag-field` (society), `.tag-outline` dashed (waitlist/pending, cream-outlined on the field).
- **Cards:** cream, 2px ink, 6px shadow (8px on the field). `StepNumber`: Anton cobalt digits with a mini extrusion and three rising bars.
- **Countdown:** ink cells, cream Anton digits, yellow mono units; minute-level polite announcement only.
- **Seats:** cobalt fill with a faint cream hatch; low = red (urgent text on yellow uses ink, see `FORBIDDEN_PAIRS`).
- **Forms** (`components/ui/Field.tsx`): white wells with a soft inset shadow, 3px cobalt focus ring, error = red-ink border with an 8px left edge on `error-bg` + a red "!" row; `aria-describedby` lists error then hint.
- **Navigation:** ink top bar (yellow focus); optional cobalt announcement strip. Floating dock on every screen size: cream tray, **active item cobalt with cream label** (red is reserved for urgency), Register yellow.
- **Dashboards** (`DashboardShell`): cobalt chrome, cream sidebar panel with **Back to site first**, cobalt strip, yellow active item; every page sits on a cream work panel. Mobile: horizontal tab strip.
- **Tickets** (`TicketCard`): cobalt header with the cream wordmark and diagonal band, dashed perforation with notches. The **QR is always black on white with a 4-module quiet zone** (`QUIET_ZONE`, `QR_DARK`/`QR_LIGHT` in `lib/tickets/layout.ts`), never on cobalt and never under grain. The PNG export takes its colours from the tokens, no texture.
- **Typed errors** (`ErrorPanel`): `role="alert"`, takes focus unless the fix is in the fields, ink text on a light red tint over cream, one recovery action.
- **Attendee lists:** "Who's going" panel; avatars only through `safeAvatarUrl()` with `referrerPolicy="no-referrer"`; signed-out visitors see the count only.
- **OG cards** (`lib/og.tsx`, `lib/og-font.ts`): cobalt card in the same frame. Anton and Space Mono 700 are fetched from Google Fonts at render time (cached, with a timeout); if either fails the whole card falls back to the built-in font.

## Shape & elevation
Square corners only. Borders 2px ink. Hard offset shadows: 3–4px controls, 6px featured panels, 8px on the field and for modals. Hover lifts −2px with a 6px shadow; press sinks +3px on buttons (+2px on `.lift` cards), 150ms.

## Motion (calm)
Stair lettering climbs in once (transform/opacity, 70ms stagger) only under `prefers-reduced-motion: no-preference`; otherwise it renders in place. Fade + 16px rise on scroll, once. Marquees pause on hover. Never animate `text-shadow`. No parallax, particles, tilt, custom cursor, loader or page wipes. Reduced motion: everything static, smooth scroll off.

## Interaction & a11y
- Touch targets ≥ 44px below 1024px; 8px+ gaps; `cursor: pointer` on every clickable.
- Focus ring: 3px `var(--focus)`, 3px offset — ink on cream; yellow in `.on-field`, the top bar and the footer; cobalt for inputs. A focusable card sitting directly on the field draws its ring yellow, ink again when nested in a cream panel.
- Modals: focus trap, Esc, restore focus, 55% ink scrim. Accordions: `aria-expanded`, `inert` when closed.
- Forms: `Field`, visible mono labels, red `*` + `aria-required`, validate on blur, errors under fields, focus first invalid on submit.
- After client navigation, focus moves to `#main`. Skip link first.
- Print: fields lose their background, grain, ghost and bands; text turns ink.

## z-index scale
40 top bar · 50 dock · 60 modal · 70 toast · 80 skip link. A `.field` is its own stacking context: ghost word, bands and content are `z-index: auto` and paint in DOM order, then 5 print grain, then 6 cream panels. Nothing between `.field` and a panel may create a stacking context (no z-index on `.field-content` / `.frame`), or the panel is trapped under the grain.

## Verifying visually
`node scripts/visual-check.mjs [baseUrl=http://localhost:3123] [outDir=.shots] [--keyboard] [--only=home,event] [--vp=375,1280]` (needs Chrome; `CHROME_PATH` overrides the default Windows install path). It takes full-page screenshots of every major page type at 320, 375 and 1280 plus a reduced-motion pass at 375, prints a horizontal-overflow report and exits 1 if any page scrolls sideways. `--keyboard` adds a Tab pass on `/` and `/login`: it logs each focused element, its outline and whether an ancestor clips the ring, and screenshots every stop. Screenshots go to `.shots/` (git-ignored).

## Known limitation
For an unknown society or event slug (`/s/nope`, `/events/nope`) the 404 status and `noindex` are correct, but the 404 body is streamed rather than present in the initial server HTML (calling `notFound()` from `generateMetadata` made no difference on a production build). Accepted; fixing it would need a check in middleware.
