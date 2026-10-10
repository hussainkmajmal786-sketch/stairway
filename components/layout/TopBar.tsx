"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { StairMark, Wordmark } from "@/components/ui/Logo";
import { AnnouncementBar } from "./AnnouncementBar";
import { AccountButton } from "./AccountButton";
import { useClock } from "@/components/providers/ClockProvider";
import { formatDate, pad2 } from "@/lib/weekends";
import { nextStepLabel } from "@/lib/design/next-label";

/** Slim ink top bar (yellow focus ring): brand on the left, the next step on the right. Main navigation lives in the dock. */
export function TopBar() {
  const { next } = useClock();
  const ref = useRef<HTMLElement>(null);
  // the announcement strip wraps to several lines on phones: publish the real header height so in-page anchors
  // (scroll-padding-top in globals.css) never land under the sticky header
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--header-h", `${Math.ceil(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--header-h");
    };
  }, []);
  return (
    <header ref={ref} className="sticky top-0 z-40">
      <AnnouncementBar />
      <div className="topbar border-b-2 border-ink bg-ink text-paper">
        <div className="wrap flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex min-h-11 min-w-11 items-center justify-center gap-2.5 text-[1.3rem] sm:text-[1.6rem]" aria-label="st(AI)rway home">
            <StairMark size={28} tone="field" />
            {/* below 375px only the mark shows, so the next-step button and the account chip keep 44px targets at 320 */}
            <Wordmark className="hidden min-[375px]:inline" />
          </Link>
          <div className="flex items-center gap-2">
            {next && (
              <Link
                href={`/events/${next.slug}`}
                className="btn btn-sm btn-secondary !whitespace-nowrap !px-3"
                aria-label={nextStepLabel(next)}
              >
                <CalendarDays size={16} strokeWidth={2} className="hidden shrink-0 min-[400px]:block" aria-hidden />
                <span className="hidden sm:inline">Next ·</span> Step {pad2(next.step)}
                <span className="hidden md:inline">· {formatDate(next.start, { day: "2-digit", month: "short" })}</span>
              </Link>
            )}
            <AccountButton />
          </div>
        </div>
      </div>
    </header>
  );
}
