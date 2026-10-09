"use client";

import { useEffect, useState } from "react";
import { useClock } from "@/components/providers/ClockProvider";
import { pad2 } from "@/lib/weekends";
import { cn } from "@/lib/utils";

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

// Preferred cell widths. Cells are square, may shrink (min-w-0) when the container is narrower than four of them
// (320px phones, narrow rails), and size their digits from their own width (cqi), so nothing overflows.
const CELL = { sm: "w-16", md: "w-16 md:w-24", lg: "w-20 md:w-28" };

/**
 * Poster countdown: ink cells, cream Anton digits, yellow mono units. The visual cells are hidden from assistive tech;
 * a role="timer" element carries minute-level text and is explicitly polite (a timer is aria-live="off" by default),
 * so screen readers hear at most one update a minute, never every tick.
 */
export function Countdown({
  target,
  size = "md",
  className,
  label = "until the next step",
}: {
  target: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}) {
  const { now: clockNow } = useClock();
  const [tick, setTick] = useState(clockNow);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // the shared clock jumps to real time right after hydration; ticks refine it per second
  const t = split(new Date(target).getTime() - Math.max(tick, clockNow));
  const units: [string, number][] = [
    ["Days", t.d],
    ["Hours", t.h],
    ["Min", t.m],
    ["Sec", t.s],
  ];

  return (
    <div className={cn("inline-flex max-w-full flex-col", className)}>
      <div className="flex max-w-full items-start gap-1.5 md:gap-2" aria-hidden="true">
        {units.map(([u, v]) => (
          <div
            key={u}
            className={cn("@container flex aspect-square min-w-0 shrink flex-col items-center justify-center border-2 border-ink bg-ink text-paper", CELL[size])}
          >
            <span className="block overflow-hidden font-display text-[length:46cqi] leading-none tabular">
              <span key={pad2(v)} className="block animate-[roll_0.25s_var(--ease)]">{pad2(v)}</span>
            </span>
            <span className="mt-[6cqi] font-mono text-[length:clamp(0.5rem,13cqi,0.7rem)] font-bold uppercase tracking-[0.12em] text-yellow">{u}</span>
          </div>
        ))}
      </div>
      <p className="sr-only" role="timer" aria-live="polite" aria-atomic="true">
        {t.d} days, {t.h} hours and {t.m} minutes {label}
      </p>
    </div>
  );
}
