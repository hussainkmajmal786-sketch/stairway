// Shared JSX for generated Open Graph images (rendered by next/og, i.e. Satori: every multi-child div is a flexbox).
import { FRAME_ORG } from "@/lib/design/brand";
import { TOKENS as T } from "@/lib/design/tokens";

export const ogSize = { width: 1200, height: 630 };
export const OG_DISPLAY = "Anton";
export const OG_MONO = "Space Mono";

const DEPTH = 6;
const GLYPHS = ["s", "t", "(AI)", "r", "w", "a", "y"];

/** The home card's copy; also the generic card for an unknown or unpublished event slug. */
export const OG_HOME = { eyebrow: "Weekend AI event series", subtitle: "Climb into AI · one weekend at a time" } as const;

/** Glyphs each font must cover for a card (Google Fonts subsets by `text`; the eyebrow is uppercased by CSS). */
export function ogFontText({ eyebrow, title, subtitle }: { eyebrow: string; title: string | null; subtitle: string }) {
  return { display: title === null ? GLYPHS.join("") : title.toUpperCase(), mono: `${eyebrow.toUpperCase()}${subtitle}${FRAME_ORG}` };
}

/** Eyebrow chip colour: yellow; orange for the finale (the summit). */
export const ogAccent = (finale: boolean) => (finale ? T.orange : T.yellow);

/** Titles longer than `max` are cut at a word with an ellipsis (keeps the card to two title lines). */
export function ogTitle(title: string, max = 60): string {
  const t = title.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/** Satori's handling of long text-shadow lists is unverified: extrude with stacked ink copies under the cream face. */
function Extruded({ text, size, step, block = false }: { text: string; size: number; step: number; block?: boolean }) {
  const width = block ? { width: "100%" } : {};
  const upper = block ? { textTransform: "uppercase" as const } : {};
  return (
    <div style={{ position: "relative", display: "flex", fontFamily: OG_DISPLAY, fontSize: size, lineHeight: 0.95, ...width, ...upper }}>
      {Array.from({ length: DEPTH }, (_, i) => {
        const k = DEPTH - i;
        return (
          <div key={k} style={{ position: "absolute", left: k * step, top: -k * step, display: "flex", color: T.ink, ...width, ...upper }}>
            {text}
          </div>
        );
      })}
      <div style={{ position: "relative", display: "flex", color: T.paper, ...width, ...upper }}>{text}</div>
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
              // Satori sets Anton's tall parentheses lower than browsers do: a full line box keeps them on the block.
              lineHeight: 1.08,
              padding: `${size * 0.02}px ${size * 0.07}px 0`,
              margin: `0 ${size * 0.04}px 0 ${size * 0.03}px`,
              boxShadow: `${size * 0.12}px ${-size * 0.12}px 0 ${T.ink}`,
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
        {/* logo row: FRAME_ORG text only — user decision: no separate "IEEE" mark */}
        <div style={{ display: "flex", alignItems: "center", paddingBottom: 12, borderBottom: "2px solid rgba(244,239,230,0.35)" }}>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>{FRAME_ORG}</div>
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
          {subtitle ? <div style={{ display: "flex", fontSize: 26, fontWeight: 700, marginTop: 18 }}>{subtitle}</div> : null}
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
