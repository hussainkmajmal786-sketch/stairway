"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { withStatus, getNext, type WeekendWithStatus } from "@/lib/weekends";

interface Clock {
  now: number;
  weekends: WeekendWithStatus[];
  next: WeekendWithStatus;
}

const ClockContext = createContext<Clock | null>(null);

/**
 * Server renders with the build/request time; the client switches to the
 * real clock after hydration and re-checks every minute, so statuses and the
 * countdown target always reflect today's date without hydration mismatches.
 */
export function ClockProvider({ initialNow, children }: { initialNow: number; children: React.ReactNode }) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    // Sync to the real clock after hydration, then every minute.
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  const value = useMemo(() => {
    const weekends = withStatus(now);
    return { now, weekends, next: getNext(weekends) };
  }, [now]);

  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

export function useClock() {
  const ctx = useContext(ClockContext);
  if (!ctx) throw new Error("useClock must be used inside <ClockProvider>");
  return ctx;
}
