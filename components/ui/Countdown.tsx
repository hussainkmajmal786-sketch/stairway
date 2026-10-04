"use client";

import { useEffect, useState } from "react";
import { useClock } from "@/components/providers/ClockProvider";
import { pad2 } from "@/lib/weekends";
import { cn } from "@/lib/utils";

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Flip-board countdown: each unit is an ink-bordered tile with mono digits. */
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
  const units: [string, number, string][] = [
    ["Days", t.d, "bg-yellow"],
    ["Hours", t.h, "bg-paper"],
    ["Min", t.m, "bg-paper"],
    ["Sec", t.s, "bg-paper"],
  ];
  const digit = { sm: "text-2xl w-14 h-14", md: "text-3xl md:text-4xl w-16 h-16 md:w-20 md:h-20", lg: "text-4xl md:text-6xl w-20 h-20 md:w-28 md:h-28" };

  return (
    <div className={cn("inline-flex flex-col", className)}>
      <div className="flex items-start gap-2 md:gap-3" aria-hidden="true">
        {units.map(([u, v, bg]) => (
          <div key={u} className="flex flex-col items-center">
            <span className={cn("grid place-items-center overflow-hidden border-2 border-ink font-mono font-bold tabular shadow-[3px_3px_0_0_var(--ink)]", bg, digit[size])}>
              <span key={pad2(v)} className="block animate-[roll_0.25s_var(--ease)]">{pad2(v)}</span>
            </span>
            <span className="mono mt-2 text-[0.65rem] font-bold text-ink-4">{u}</span>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {t.d} days, {t.h} hours and {t.m} minutes {label}
      </p>
    </div>
  );
}
