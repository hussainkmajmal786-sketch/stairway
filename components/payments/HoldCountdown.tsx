"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { useClock } from "@/components/providers/ClockProvider";
import { holdAnnouncement, holdRemaining } from "@/lib/payments/countdown";
import { cn } from "@/lib/utils";

/**
 * Live "m:ss" left on a seat hold, ticking once a second without animation. The first render uses the shared clock's
 * request time (ClockProvider initialNow), so server and client markup match. Screen readers get minute-level text only
 * (role="timer", explicitly polite), never every tick. At zero it shows "Hold expired — refresh" and, by default,
 * refreshes the server-rendered route once so the page shows the server's expired state (never client-only state).
 */
export function HoldCountdown({
  expiresAt,
  className,
  refreshOnExpiry = true,
  suffix = "",
}: {
  expiresAt: string;
  className?: string;
  refreshOnExpiry?: boolean;
  /** Visible text after the time while the hold is live, e.g. " left to pay" (dropped once it expired). */
  suffix?: string;
}) {
  const router = useRouter();
  const { now: clockNow } = useClock();
  const [tick, setTick] = useState(clockNow);
  const refreshed = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setTick(now);
      if (!holdRemaining(expiresAt, now).expired) return;
      clearInterval(id);
      if (refreshOnExpiry && !refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, refreshOnExpiry, router]);

  // The shared clock jumps to real time right after hydration; ticks refine it per second.
  const left = holdRemaining(expiresAt, Math.max(tick, clockNow));
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2", className)}>
      {left.expired ? (
        <>
          <span aria-hidden="true">Hold expired —</span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1 underline decoration-2 underline-offset-4"
          >
            <RotateCw size={14} strokeWidth={2.5} aria-hidden /> Refresh
          </button>
        </>
      ) : (
        <span aria-hidden="true" className="tabular">
          {left.label}
          {suffix}
        </span>
      )}
      <span className="sr-only" role="timer" aria-live="polite" aria-atomic="true">
        {holdAnnouncement(left)}
      </span>
    </span>
  );
}
