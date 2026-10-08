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
 * SVGs, swap this body for them and keep FRAME_ORG as their accessible name. `middle` is optional (hidden on
 * phones) and renders nothing unless a caller passes real copy.
 */
export function LogoRow({ org = FRAME_ORG, middle }: { org?: string; middle?: string }) {
  return (
    <div className="logo-row">
      <span className="lm">
        <span className="diamond" aria-hidden="true" />
        {org}
      </span>
      {middle && <span className="lm mid">{middle}</span>}
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
  as: Tag = "section",
  id,
  labelledBy,
  label,
  ghost = GHOST_DEFAULT,
  bands = "none",
  deep = false,
  className,
  innerClassName,
  children,
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
