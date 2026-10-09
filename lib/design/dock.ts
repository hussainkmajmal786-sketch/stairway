/** Below 360px the six blocks narrow to 44px (still ≥44px targets) so the dock fits a 320px screen. */
export const DOCK_NARROW = "max-[359px]:min-w-11 max-[359px]:px-2";

const BASE =
  `flex h-12 min-w-12 items-center justify-center gap-2 border-2 border-ink px-3 ${DOCK_NARROW} font-mono text-[0.72rem] font-bold uppercase tracking-[0.12em] transition-[background,transform] duration-150 hover:-translate-y-0.5`;

/** Dock item classes: the active item is cobalt with cream text (red is reserved for urgency and errors). */
export function dockItemClass(on: boolean): string {
  return `${BASE} ${on ? "bg-field text-paper" : "bg-paper-2 text-ink hover:bg-paper-3"}`;
}
