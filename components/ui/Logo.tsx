import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { TOKENS } from "@/lib/design/tokens";

/**
 * The st(AI)rway wordmark (Urbanist). "(AI)" sits on a yellow block with ink text: the brand's core. Screen readers
 * get one sr-only "st(AI)rway"; the styled pieces are aria-hidden (aria-label on a plain span is not announced).
 */
export function Wordmark({ className, block = true }: { className?: string; block?: boolean }) {
  return (
    <span className={cn("font-sans font-semibold tracking-[-0.04em]", className)}>
      <span className="sr-only">st(AI)rway</span>
      <span aria-hidden="true">st</span>
      <span aria-hidden="true" className={cn(block && "mx-[0.04em] bg-yellow px-[0.08em] text-ink")}>(AI)</span>
      <span aria-hidden="true">rway</span>
    </span>
  );
}

/** Square stair glyph: three steps climbing to a yellow block. `field` = cobalt square + cream stair (dark surfaces). */
export function StairMark({ size = 28, className, tone = "paper" }: { size?: number; className?: string; tone?: "paper" | "field" }) {
  const dark = tone === "field";
  const line = dark ? TOKENS.paper : TOKENS.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" fill={dark ? TOKENS.field : TOKENS.paper} stroke={line} strokeWidth="2" />
      <path d="M5 26 H12 V19 H19 V12 H26" fill="none" stroke={line} strokeWidth="2.5" strokeLinejoin="miter" />
      <rect x="21" y="5" width="7" height="7" fill={TOKENS.yellow} stroke={TOKENS.ink} strokeWidth="2" />
    </svg>
  );
}

export const WORDMARK_GLYPHS = ["s", "t", "(AI)", "r", "w", "a", "y"] as const;

type StairTag = "h1" | "h2" | "p" | "span";

/**
 * Extruded stair-step lettering: each glyph rises one step (--i) and casts a 10-layer ink extrusion. One sr-only
 * label gives screen readers a clean word (not letter by letter, not twice); the glyph spans are aria-hidden. The
 * climb-in animation runs only under prefers-reduced-motion: no-preference (otherwise the glyphs render in place).
 */
export function StairText({
  glyphs,
  label,
  as: Tag = "p",
  id,
  className,
}: {
  glyphs: readonly string[];
  label: string;
  as?: StairTag;
  id?: string;
  className?: string;
}) {
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
