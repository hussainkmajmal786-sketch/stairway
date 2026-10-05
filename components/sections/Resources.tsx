"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, FileText, FolderOpen, NotebookPen, Search, Video } from "lucide-react";
import { Github } from "@/components/ui/BrandIcons";
import { useClock } from "@/components/providers/ClockProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LevelChip } from "@/components/ui/Badges";
import { pad2 } from "@/lib/weekends";

const LEVELS = ["All", "Beginner", "Intermediate", "Advanced", "All levels"];

export function ResourceHub({ showAll = false }: { showAll?: boolean }) {
  const { weekends } = useClock();
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("All");

  const done = useMemo(
    () =>
      weekends
        .filter((w) => w.status === "completed" && Object.keys(w.resources).length > 0)
        .filter((w) => level === "All" || w.level === level)
        .filter((w) => `${w.title} ${w.topic} ${w.summary}`.toLowerCase().includes(q.trim().toLowerCase())),
    [weekends, q, level],
  );
  const list = showAll ? done : done.slice(0, 6);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <label className="relative block w-full md:max-w-sm">
          <span className="sr-only">Search resources</span>
          <Search size={18} strokeWidth={2} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by topic — e.g. regression"
            className="h-12 w-full border-2 border-ink bg-paper pl-11 pr-4 shadow-[3px_3px_0_0_var(--ink)] outline-none placeholder:text-ink-4 focus:bg-paper-2"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by level">
          {LEVELS.map((l) => (
            <button key={l} className="chip-btn" aria-pressed={level === l} onClick={() => setLevel(l)}>{l}</button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="box-2 p-10 text-center text-ink-2">
          Nothing matches yet. Materials appear here after each step is climbed — check back after{" "}
          {weekends.find((w) => w.status === "next")?.title ?? "the next weekend"}.
        </p>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {list.map((w, i) => {
            const r = w.resources!;
            const links = [
              r.slides && { href: r.slides, label: "Slides", Icon: FileText },
              r.code && { href: r.code, label: "Code", Icon: Github },
              r.notebook && { href: r.notebook, label: "Notebook", Icon: NotebookPen },
              r.recording && { href: `/events/${w.slug}#recording`, label: "Recording", Icon: Video },
              ...(r.reading ?? []).map((x) => ({ href: x.href, label: "Reading", Icon: BookOpen })),
            ].filter(Boolean) as { href: string; label: string; Icon: (p: { size?: number; strokeWidth?: number }) => React.ReactNode }[];
            return (
              <li key={w.slug} className="box flex flex-col shadow-hard" data-reveal style={{ ["--d" as string]: i % 3 }}>
                <div className="flex items-center justify-between border-b-2 border-ink bg-paper-2 px-5 py-3">
                  <span className="font-mono font-bold">Step {pad2(w.step)}</span>
                  <LevelChip level={w.level} />
                </div>
                <div className="p-5">
                  <h3 className="text-xl font-semibold">{w.title}</h3>
                  <p className="text-sm text-ink-3">{w.topic}</p>
                  <ul className="mt-5 grid grid-cols-2 gap-2">
                    {links.map(({ href, label, Icon }) => (
                      <li key={label + href}>
                        <a
                          href={href}
                          {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          className="flex min-h-11 items-center gap-2 border-2 border-ink px-3 text-sm font-medium hover:bg-yellow"
                        >
                          <Icon size={16} strokeWidth={2} /> {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Resources() {
  return (
    <section id="resources" aria-labelledby="resources-title" className="section section-alt">
      <div className="wrap">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <SectionHeader id="resources-title" Icon={FolderOpen} eyebrow="Resources hub" title="Missed a step? [[Catch up.]]" lead="Slides, code, notebooks and recordings from every weekend we've climbed." className="!mb-0" />
          <Link href="/resources" className="btn btn-ghost shrink-0">All resources <ArrowRight size={16} strokeWidth={2} /></Link>
        </div>
        <div className="mt-10"><ResourceHub /></div>
      </div>
    </section>
  );
}
