"use client";

import { useState } from "react";
import { Footprints } from "lucide-react";
import { useClock } from "@/components/providers/ClockProvider";
import { WeekendRow } from "./WeekendCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { societyStairway } from "@/lib/events/status";

const FILTERS = [
  { id: "all" },
  { id: "open", label: "Open" },
  { id: "completed", label: "Climbed" },
] as const;

/**
 * The roadmap as a list of steps. On wide screens each step sits a little
 * further right than the one before, so the column reads as a staircase.
 */
export function Stairway({ societySlug, title = "Every step, [[one weekend at a time.]]" }: { societySlug: string; title?: string }) {
  const { weekends: all } = useClock();
  const weekends = societyStairway(all, societySlug);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const list = weekends.filter((w) => (filter === "all" ? true : filter === "completed" ? w.status === "completed" : w.status !== "completed"));
  const climbed = weekends.filter((w) => w.status === "completed").length;

  return (
    <section id="stairway" aria-labelledby="stairway-title" className="section">
      <div className="wrap">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeader
            id="stairway-title"
            Icon={Footprints}
            eyebrow="The roadmap"
            title={title}
            lead="Every weekend is one step up. Start anywhere — each step lists exactly what you need to know first."
            className="!mb-0"
          />
          <div className="box-2 shrink-0 px-5 py-4 shadow-hard" data-reveal>
            <p className="mono font-bold text-ink-3">Progress</p>
            <p className="font-mono text-3xl font-bold tabular">
              {String(climbed).padStart(2, "0")}<span className="text-ink-4"> / {weekends.length}</span>
            </p>
            <div className="mt-2 flex gap-1" aria-hidden>
              {weekends.map((w) => (
                <span key={w.slug} className={`h-3 w-3 border-2 border-ink ${w.status === "completed" ? "bg-green" : w.status === "next" ? "bg-yellow" : "bg-paper"}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-2" role="group" aria-label="Filter steps">
          {FILTERS.map((f) => (
            <button key={f.id} className="chip-btn" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {"label" in f ? f.label : `All ${weekends.length} steps`}
            </button>
          ))}
        </div>

        <ol className="mt-8 flex flex-col gap-6">
          {list.map((w) => (
            <li
              key={w.slug}
              data-reveal
              // staircase indent: up to 9 × 14px on large screens
              style={{ ["--step" as string]: Math.min(w.step - 1, 9) }}
              className="lg:ml-[calc(var(--step)*14px)] lg:mr-[calc((9_-_var(--step))*14px)]"
            >
              <WeekendRow w={w} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
