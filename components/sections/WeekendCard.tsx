"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock, FolderOpen, Hourglass, MapPin, Mountain, Users } from "lucide-react";
import type { WeekendWithStatus } from "@/lib/weekends";
import { daysUntil, pad2, registerHref, shortDate, timeOf } from "@/lib/weekends";
import { FormatChip, LevelChip, SeatsBar, StatusChip } from "@/components/ui/Badges";
import { useClock } from "@/components/providers/ClockProvider";
import { event } from "@/data/event";
import { cn } from "@/lib/utils";

const STEP_FILL: Record<string, string> = {
  explorer: "bg-green",
  builder: "bg-blue",
  innovator: "bg-purple",
  summit: "bg-orange",
};

/** One step of the stairway, laid out like an event listing. */
export function WeekendRow({ w }: { w: WeekendWithStatus }) {
  const { now } = useClock();
  const summit = w.track === "summit";
  const days = daysUntil(w.start, now);
  const done = w.status === "completed";

  return (
    <article
      aria-labelledby={`wk-${w.slug}`}
      className={cn(
        "grid border-2 border-ink bg-paper sm:grid-cols-[132px_1fr]",
        w.status === "next" ? "shadow-[6px_6px_0_0_var(--ink)]" : "shadow-[4px_4px_0_0_var(--ink)]",
        done && "bg-paper-2",
      )}
    >
      {/* step block */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-ink px-4 py-3 max-sm:border-b-2 sm:flex-col sm:items-start sm:justify-between sm:border-r-2 sm:p-4",
          done ? "bg-paper-3" : STEP_FILL[w.track],
        )}
      >
        <span className="mono font-bold">Step</span>
        <span className="font-mono text-4xl font-bold leading-none sm:text-6xl">{pad2(w.step)}</span>
        {summit && <Mountain size={22} strokeWidth={2} aria-hidden className="max-sm:hidden" />}
      </div>

      <div className="p-5 md:p-6">
        <div className="flex flex-wrap gap-2">
          <LevelChip level={w.level} />
          {w.formats.map((f) => (
            <FormatChip key={f} format={f} />
          ))}
          {done ? (
            <StatusChip status="completed" />
          ) : (
            <span className={cn("tag", w.status === "next" ? "tag-red" : "tag-yellow")}>
              <Hourglass size={12} strokeWidth={2.5} aria-hidden />
              {days === 0 ? "Today" : `In ${pad2(days)} ${days === 1 ? "day" : "days"}`}
            </span>
          )}
          {w.status === "next" && <StatusChip status="next" />}
        </div>

        <h3 id={`wk-${w.slug}`} className="mt-4 text-2xl font-semibold leading-tight md:text-[1.75rem]">
          <Link href={`/weekend/${w.slug}`} className="underline-offset-4 hover:underline">
            {w.title}
          </Link>
        </h3>
        <p className="mono mt-1 font-bold text-ink-3">{w.topic}</p>
        <p className="mt-3 max-w-2xl text-ink-2">{w.summary}</p>

        <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="meta-label text-blue-ink"><CalendarDays size={14} strokeWidth={2} aria-hidden /> When</dt>
            <dd className="mt-1 text-sm">{shortDate(w.start)} · {timeOf(w.start)}</dd>
          </div>
          <div>
            <dt className="meta-label text-purple-ink"><MapPin size={14} strokeWidth={2} aria-hidden /> Where</dt>
            <dd className="mt-1 truncate text-sm">{event.venue.hall}, CEK</dd>
          </div>
          <div>
            <dt className="meta-label text-green-ink"><Users size={14} strokeWidth={2} aria-hidden /> Seats</dt>
            <dd className="mt-1 text-sm">{done ? "Closed" : `${w.seatsLeft} of ${w.seatsTotal} left`}</dd>
          </div>
        </dl>

        {!done && <SeatsBar seatsLeft={w.seatsLeft} seatsTotal={w.seatsTotal} showLabel={false} className="mt-4 max-w-md" />}

        <div className="mt-5 flex flex-wrap gap-3">
          {done ? (
            <Link href={`/weekend/${w.slug}#resources`} className="btn btn-sm btn-ghost">
              <FolderOpen size={16} strokeWidth={2} aria-hidden /> Resources
            </Link>
          ) : (
            <Link href={registerHref(w.slug)} className="btn btn-sm btn-primary">
              {w.status === "next" ? "Claim your step" : "Register"} <ArrowUpRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          )}
          <Link href={`/weekend/${w.slug}`} className="btn btn-sm btn-ghost">
            <Clock size={16} strokeWidth={2} aria-hidden /> Details
          </Link>
        </div>
      </div>
    </article>
  );
}
