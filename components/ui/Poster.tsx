import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FRAME_ORG } from "@/lib/design/brand";
import { GHOST_DEFAULT, ghostRows } from "@/lib/design/ghost";

/** Huge rotated background word (CLIMB, STEP 04, SUMMIT). Decorative: never read, never over photos or forms. */
export function Ghost({ word, rows = 6, className }: { word: string; rows?: number; className?: string }) {
  return (
    <div className={cn("ghost", className)} aria-hidden="true">
      {ghostRows(word, rows).map((row, i) => (
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
 * The frame's logo row: the decorative diamond and the text FRAME_ORG ("IEEE SB CE KIDANGOOR"), nothing else (no
 * separate "IEEE" mark). When the branch supplies a cream logo SVG, swap the body for it and keep FRAME_ORG as its
 * accessible name. `middle` is optional (hidden on phones) and renders nothing unless a caller passes real copy.
 */
export function LogoRow({ org = FRAME_ORG, middle, showText = true, trailing }: { org?: string; middle?: string; showText?: boolean; trailing?: ReactNode }) {
  return (
    <div className="logo-row">
      <span className="lm">
        <span className="diamond" aria-hidden="true" />
        {showText && org}
      </span>
      {middle && <span className="lm mid">{middle}</span>}
      {trailing}
    </div>
  );
}

/** Cream double frame (6px border + inset 2px outline) with the logo row on top. */
export function Frame({
  children,
  logoRow = true,
  logoText = true,
  logoTrailing,
  className,
}: {
  children: ReactNode;
  logoRow?: boolean;
  /** false hides the FRAME_ORG text in the logo row (the diamond stays). */
  logoText?: boolean;
  /** Decorative extra in the logo row (the hero's step progress). */
  logoTrailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("frame", className)}>
      {logoRow && <LogoRow showText={logoText} trailing={logoTrailing} />}
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
  /** Tall headers (event pages): 14 ghost rows on phones so the word fills the header, the usual 6 from 640px. */
  tallGhost?: boolean;
  bands?: "none" | "top" | "both";
  /** Decorative theme layer (aria-hidden) drawn above the ghost word and below the bands and content. */
  decor?: ReactNode;
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
  as: Tag = "section",
  id,
  labelledBy,
  label,
  ghost = GHOST_DEFAULT,
  tallGhost = false,
  bands = "none",
  decor,
  deep = false,
  className,
  innerClassName,
  children,
}: FieldBandProps) {
  // a named <div> needs a landmark role (ARIA prohibits naming a generic element)
  const role = Tag === "div" && (label || labelledBy) ? "region" : undefined;
  return (
    <Tag id={id} role={role} aria-labelledby={labelledBy} aria-label={label} className={cn("field on-field", deep && "field-2", className)}>
      {ghost && (tallGhost ? <Ghost word={ghost} rows={14} className="ghost-tall" /> : <Ghost word={ghost} />)}
      {decor}
      {bands !== "none" && <Bands edge="top" />}
      {bands === "both" && <Bands edge="bottom" />}
      <div className={cn("field-content", innerClassName)}>{children}</div>
    </Tag>
  );
}
