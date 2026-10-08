import { cn } from "@/lib/utils";

/** The st(AI)rway wordmark. "(AI)" sits on a yellow block — the brand's core. */
export function Wordmark({ className, block = true }: { className?: string; block?: boolean }) {
  return (
    <span className={cn("font-sans font-semibold tracking-[-0.04em]", className)} aria-label="st(AI)rway">
      <span aria-hidden>st</span>
      <span aria-hidden className={cn(block && "mx-[0.04em] bg-yellow px-[0.08em] text-ink")}>(AI)</span>
      <span aria-hidden>rway</span>
    </span>
  );
}

/** Square stair glyph: three steps climbing to a yellow block. */
export function StairMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" fill="#F4EFE6" stroke="#100F0D" strokeWidth="2" />
      <path d="M5 26 H12 V19 H19 V12 H26" fill="none" stroke="#100F0D" strokeWidth="2.5" strokeLinejoin="miter" />
      <rect x="21" y="5" width="7" height="7" fill="#FFB200" stroke="#100F0D" strokeWidth="2" />
    </svg>
  );
}
