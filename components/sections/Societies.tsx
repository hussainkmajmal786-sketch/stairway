"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronRight, Layers, RotateCcw, Sparkles } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { useClock } from "@/components/providers/ClockProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { nextForSociety } from "@/lib/events/status";
import { SOCIETY_FILL } from "@/lib/events/colors";
import { quiz, quizLevel } from "@/data/tracks";
import { pad2, shortDate } from "@/lib/weekends";
import { cn } from "@/lib/utils";
import { useRegisterHref } from "@/components/registration/useRegisterHref";
import { SmartLink } from "@/components/ui/SmartLink";

function Quiz() {
  const { weekends } = useClock();
  const registerHref = useRegisterHref();
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const level = quizLevel(score);
  const open = weekends.filter((w) => w.status !== "completed").sort((a, b) => a.start.localeCompare(b.start));
  const rec = open.find((w) => w.level === level) ?? open.find((w) => w.level === "All levels") ?? open[0];

  const answer = (s: number) => {
    setScore(score + s);
    if (i + 1 < quiz.length) setI(i + 1);
    else setDone(true);
  };

  return (
    <div className="box-2 shadow-hard" data-reveal>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-6 py-4">
        <h3 className="mono text-sm font-bold">Which session should you start with?</h3>
        {!done && <span className="tag tag-ink">Q{i + 1} / {quiz.length}</span>}
      </div>
      <div className="p-6 md:p-8" aria-live="polite">
        {!done ? (
          <div key={i}>
            <p className="text-2xl font-semibold">{quiz[i].q}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {quiz[i].options.map((o) => (
                <button key={o.label} onClick={() => answer(o.score)} className="flex min-h-14 items-center justify-between gap-3 border-2 border-ink bg-paper px-4 py-3 text-left hover:shadow-[4px_4px_0_0_var(--ink)]">
                  {o.label} <ChevronRight size={18} strokeWidth={2} aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : rec ? (
          <div>
            <p className="meta-label text-ink-3"><Sparkles size={15} strokeWidth={2} aria-hidden /> Start at the {level.toLowerCase()} level</p>
            <p className="mt-3 text-3xl font-semibold"><span className="bg-yellow px-1">{rec.society.shortName} · Step {pad2(rec.step)}</span> — {rec.title}</p>
            <p className="mt-2 text-ink-3">{rec.topic}. {rec.summary}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <SmartLink href={registerHref(rec.slug)} className="btn btn-primary">Claim this step <ArrowRight size={16} strokeWidth={2} /></SmartLink>
              <Link href={`/events/${rec.slug}`} className="btn btn-secondary">Details</Link>
              <button onClick={() => { setI(0); setScore(0); setDone(false); }} className="btn btn-secondary"><RotateCcw size={16} strokeWidth={2} /> Retake</button>
            </div>
          </div>
        ) : (
          <p>No open sessions right now — check back soon.</p>
        )}
      </div>
    </div>
  );
}

/** One card per society: its tracks and its next session. */
export function Societies() {
  const { societies } = useSiteData();
  const { weekends } = useClock();
  return (
    <section id="societies" aria-labelledby="societies-title" className="section section-alt">
      <div className="wrap">
        <SectionHeader id="societies-title" Icon={Layers} eyebrow="Five societies · five stairways" title="Pick your [[stairway.]]" lead="Every IEEE society at CEK runs its own weekly climb. Follow one, or hop between them." />
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {societies.map((s, i) => {
            const next = nextForSociety(weekends, s.slug);
            return (
              <li key={s.slug} data-reveal style={{ ["--d" as string]: i }} className="box flex min-w-0 flex-col shadow-hard">
                <div className={cn("flex items-center justify-between border-b-2 border-ink px-5 py-3", SOCIETY_FILL[s.color])}>
                  <span className="mono font-bold">{s.shortName}</span>
                  <span className="mono font-bold">{weekends.filter((w) => w.society.slug === s.slug).length} steps</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-2xl font-semibold">{s.name}</h3>
                  <p className="mt-2 text-ink-2">{s.description}</p>
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tracks">
                    {s.tracks.map((t) => <li key={t.id} className="tag max-w-full !whitespace-normal">{t.name}</li>)}
                  </ul>
                  <div className="mt-auto pt-5">
                    {next ? (
                      <Link href={`/events/${next.slug}`} className="block border-2 border-ink bg-paper-2 p-3 hover:bg-yellow">
                        <span className="mono block font-bold">Next · Step {pad2(next.step)} · {shortDate(next.start)}</span>
                        <span className="font-semibold">{next.title}</span>
                      </Link>
                    ) : (
                      <p className="border-2 border-dashed border-ink p-3 text-sm text-ink-3">New steps announced soon.</p>
                    )}
                    <Link href={`/s/${s.slug}`} className="btn btn-sm btn-secondary mt-3 w-full">View {s.shortName} stairway <ArrowRight size={16} strokeWidth={2} /></Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-12"><Quiz /></div>
      </div>
    </section>
  );
}
