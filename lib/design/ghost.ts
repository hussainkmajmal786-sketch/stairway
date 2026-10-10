/** Zero-padded step number ("04"); junk (negative, NaN, Infinity) becomes "00". */
export function padStep(n: number): string {
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return String(v).padStart(2, "0");
}

/** The ghost word on home and general pages. */
export const GHOST_DEFAULT = "CLIMB";

/** The ghost word on the finale session. */
export const GHOST_FINALE = "SUMMIT";

export type GhostContext = { kind: "home" | "general" } | { kind: "session"; step: number; finale?: boolean };

/** Background word for a page: CLIMB (home/general), STEP NN (sessions), SUMMIT (the finale). */
export function ghostWord(ctx: GhostContext): string {
  if (ctx.kind === "session") return ctx.finale ? GHOST_FINALE : `STEP ${padStep(ctx.step)}`;
  return GHOST_DEFAULT;
}

/** Rows of the repeated word for the rotated ghost block (every other row is offset in CSS). */
export function ghostRows(word: string, rows = 6, perRow = 3): string[] {
  const line = Array.from({ length: Math.max(0, Math.floor(perRow)) }, () => word.toUpperCase()).join(" ");
  return Array.from({ length: Math.max(0, Math.floor(rows)) }, () => line);
}
