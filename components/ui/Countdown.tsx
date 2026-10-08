"use client";

import { useEffect, useState } from "react";
import { useClock } from "@/components/providers/ClockProvider";
import { pad2 } from "@/lib/weekends";
import { cn } from "@/lib/utils";

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const CELL = {
  sm: "h-16 w-16",
  md: "h-[4.5rem] w-[4.5rem] md:h-24 md:w-24",
  lg: "h-20 w-20 md:h-28 md:w-28",
};
const DIGIT = { sm: "text-3xl", md: "text-4xl md:text-5xl", lg: "text-5xl md:text-6xl" };

/** Poster countdown: ink cells, cream Anton digits, yellow mono units. Text-only updates (no live announcements per tick). */
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
    <div className={cn("inline-flex flex-col", className)}>
      <div className="flex items-start gap-1.5 md:gap-2" aria-hidden="true">
        {units.map(([u, v]) => (
          <div key={u} className={cn("flex flex-col items-center justify-center border-2 border-ink bg-ink text-paper", CELL[size])}>
            <span className={cn("block overflow-hidden font-display leading-none tabular", DIGIT[size])}>
              <span key={pad2(v)} className="block animate-[roll_0.25s_var(--ease)]">{pad2(v)}</span>
            </span>
            <span className="mt-1 font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-yellow">{u}</span>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {t.d} days, {t.h} hours and {t.m} minutes {label}
      </p>
    </div>
  );
}
