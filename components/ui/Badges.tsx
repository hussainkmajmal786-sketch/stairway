import { Check, Lock } from "lucide-react";
import type { WeekendStatus } from "@/data/types";
import { seatsTone } from "@/lib/weekends";
import { cn } from "@/lib/utils";

// Level → flat colour block. Text label always present, so colour is never the only signal.
const levelTag: Record<string, string> = {
  Beginner: "tag-green",
  Intermediate: "tag-blue",
  Advanced: "tag-purple",
  Expert: "tag-red",
  "All levels": "tag-yellow",
};

export function LevelChip({ level }: { level: string }) {
  return <span className={cn("tag", levelTag[level] ?? "tag-yellow")}>{level}</span>;
}

export function FormatChip({ format }: { format: string }) {
  return <span className="tag tag-outline">{format}</span>;
}

export function StatusChip({ status }: { status: WeekendStatus }) {
  if (status === "completed")
    return (
      <span className="tag tag-green">
        <Check size={13} strokeWidth={2.5} aria-hidden /> Climbed
      </span>
    );
  if (status === "next")
    return (
      <span className="tag tag-yellow">
        <span className="blink" aria-hidden /> Next up
      </span>
    );
  return (
    <span className="tag">
      <Lock size={12} strokeWidth={2.5} aria-hidden /> Unlocks soon
    </span>
  );
}

export function SeatsBar({
  seatsLeft,
  seatsTotal,
  className,
  showLabel = true,
}: {
  seatsLeft: number;
  seatsTotal: number;
  className?: string;
  showLabel?: boolean;
}) {
  const tone = seatsTone({ seatsLeft, seatsTotal });
  const filled = (seatsTotal - seatsLeft) / seatsTotal;
  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-2 flex items-center justify-between gap-3 font-mono text-xs font-bold uppercase tracking-[0.08em]">
          <span className={cn(tone === "ok" ? "text-ink-3" : "text-red-ink")}>
            {tone === "full"
              ? "Step full — join the waitlist"
              : tone === "low"
                ? `Only ${seatsLeft} seats left`
                : `${seatsLeft} / ${seatsTotal} seats left`}
          </span>
          <span className="text-ink-4 tabular">{Math.round(filled * 100)}% full</span>
        </div>
      )}
      <div className="seats-track" role="progressbar" aria-label="Seats filled" aria-valuemin={0} aria-valuemax={seatsTotal} aria-valuenow={seatsTotal - seatsLeft}>
        <div className="seats-fill" data-tone={tone} style={{ transform: `scaleX(${filled})` }} />
      </div>
    </div>
  );
}
