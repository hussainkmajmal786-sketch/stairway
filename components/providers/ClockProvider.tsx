"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSiteData } from "./SiteDataProvider";
import { nextOverall, withStatus } from "@/lib/events/status";
import type { EventWithStatus } from "@/lib/events/types";

interface Clock {
  now: number;
  /** All published events with per-society status. */
  weekends: EventWithStatus[];
  /** The soonest "next up" session across all societies. */
  next: EventWithStatus;
}

const ClockContext = createContext<Clock | null>(null);

/**
 * Server renders with the request time; the client switches to the real clock
 * after hydration and re-checks every minute.
 */
export function ClockProvider({ initialNow, children }: { initialNow: number; children: React.ReactNode }) {
  const { events } = useSiteData();
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  const value = useMemo(() => {
    const weekends = withStatus(events, now);
    const next = nextOverall(weekends) ?? weekends[weekends.length - 1];
    return { now, weekends, next };
  }, [events, now]);

  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

export function useClock() {
  const ctx = useContext(ClockContext);
  if (!ctx) throw new Error("useClock must be used inside <ClockProvider>");
  return ctx;
}
