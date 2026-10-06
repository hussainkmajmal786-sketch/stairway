"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { StairMark, Wordmark } from "@/components/ui/Logo";
import { AnnouncementBar } from "./AnnouncementBar";
import { AccountButton } from "./AccountButton";
import { useClock } from "@/components/providers/ClockProvider";
import { formatDate, pad2 } from "@/lib/weekends";

/** Slim top bar: brand on the left, the next step on the right. Main navigation lives in the dock. */
export function TopBar() {
  const { next } = useClock();
  return (
    <header className="sticky top-0 z-40">
      <AnnouncementBar />
      <div className="border-b-2 border-ink bg-paper">
        <div className="wrap flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 text-[1.6rem]" aria-label="st(AI)rway home">
            <StairMark size={28} />
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            {next && (
              <Link
                href={`/events/${next.slug}`}
                className="btn btn-sm btn-ghost !px-3 !shadow-[3px_3px_0_0_var(--ink)]"
                aria-label={`Next: Step ${next.step}, ${next.title}, ${formatDate(next.start, { day: "numeric", month: "long" })}`}
              >
                <CalendarDays size={16} strokeWidth={2} aria-hidden />
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
