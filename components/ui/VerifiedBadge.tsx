import { BadgeCheck } from "lucide-react";
import { formatDateIST } from "@/lib/community/membership";
import { cn } from "@/lib/utils";

/** Flat green block, ink text, icon + words (never colour-only). `until` is a YYYY-MM-DD computed at read time. */
export function VerifiedBadge({ until, size = "md" }: { until?: string | null; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border-2 border-ink bg-green font-mono font-bold uppercase tracking-[0.1em] text-ink",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
      )}
    >
      <BadgeCheck size={size === "sm" ? 13 : 16} strokeWidth={2.25} aria-hidden />
      Verified IEEE member
      {until ? <span className="font-medium normal-case tracking-normal"> · until {formatDateIST(until)}</span> : null}
    </span>
  );
}
