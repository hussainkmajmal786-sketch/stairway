# st(AI)rway — Design System (Master)

Source of truth for every page. Page-specific deviations go in `design-system/pages/<page>.md`.
Visual language: **paper brutalism**, inspired by arinjo.in — cream graph paper, ink outlines, hard offset shadows, flat colour blocks, square corners. Light only. Calm motion.

## Concept
"The Stairway": learning AI is a climb; every weekend is one step. The roadmap is a list of steps that indents a little further on each row (a staircase silhouette on wide screens). "(AI)" always sits on a yellow block.

## Pattern (event landing)
Hero (wordmark, next-step panel with countdown, stats strip) → topic ticker → about → next-step spotlight → stairway list → tracks + quiz → speakers → **register prompt** → proof (leaderboard, experience, testimonials, gallery) → resources → perks → team → sponsors → FAQ → IEEE → yellow CTA band → newsletter.
Sections alternate `paper` / `paper-2` bands with 2px ink rules between them.

## Navigation
- Slim sticky top bar: brand + "Next · Step 04" button. Optional ink announcement strip above it.
- **Floating bottom dock on every screen size** (Home, Societies, Speakers, Gallery, FAQ + yellow Register). Active item is red with its label; others are icon squares, with labels from 768px. Footer reserves `--dock-h` of bottom padding.

- **Dashboards** (`/me`): sidebar with a back button at the top; on mobile it collapses to a horizontal tab strip.

## Colour tokens (`app/globals.css`)
| Token | Hex | Use |
|---|---|---|
| `paper` / `paper-2` / `paper-3` | #F4EFE6 / #ECE4D7 / #E2D8C8 | page, alternate bands & panels, neutral tags |
| `ink` / `ink-2` / `ink-3` / `ink-4` | #100F0D / #3A352E / #4F4A40 / #6B6355 | text, borders, shadows, muted labels |
| `yellow` | #FFB200 | primary actions, (AI) block, highlights |
| `blue` `green` `red` `orange` `purple` | #2A8CFF #1BE349 #FF5A5A #FF5C38 #C07CFF | flat fills only — always with ink text |
| `blue-ink` `green-ink` `red-ink` `purple-ink` `amber-ink` | #0B57C9 #0A7A2A #C31F1F #6B2FB5 #8A5A00 | coloured *text* on paper (AA) |

Meaning: green = climbed / beginner, blue = intermediate, purple = advanced, orange = summit, red = urgency (days left, errors, active dock item), yellow = action. Colour never stands alone — every tag has a text label.

## Typography
Urbanist (body 17px, headings 500–600, hero 500 at up to 10rem) · Space Mono (700, uppercase, 0.12–0.18em tracking) for labels, tags, buttons and section headings (`.h2`).

## Shape & elevation
Square corners only. Borders 2px ink. Shadows are hard offsets: 3–4px for controls, 6px for featured panels, 8px for modals. Hover lifts −2px with a 6px shadow; press sinks +3px with no shadow (150ms).

## Motion (calm)
- Fade + 16px rise on scroll, once, 0.5s, 50ms stagger. Hero wordmark blurs in.
- Marquees pause on hover. "Next up" uses a blinking square. No parallax, particles, tilt, custom cursor, loader or page wipes.
- `prefers-reduced-motion`: everything static, smooth scroll off.

## Interaction & a11y
- Touch targets ≥ 44px below 1024px; 8px+ gaps. `cursor: pointer` on every clickable.
- Focus ring: 3px `blue-ink` outline, 3px offset.
- Modals: focus trap, Esc, restore focus, 55% ink scrim. Accordions: `aria-expanded`, `inert` when closed.
- Forms: use `components/ui/Field.tsx`. Visible mono labels, red `*` + `aria-required`, validate on blur, errors under fields, focus first invalid on submit.
- After client navigation, focus moves to `#main`.

## z-index scale
40 top bar · 50 dock · 60 modal · 70 toast · 80 skip link
