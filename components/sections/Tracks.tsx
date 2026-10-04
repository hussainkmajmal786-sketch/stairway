"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronRight, Layers, RotateCcw, Sparkles } from "lucide-react";
import { tracks, quiz, quizResult } from "@/data/tracks";
import { useClock } from "@/components/providers/ClockProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { pad2, registerHref } from "@/lib/weekends";
import { cn } from "@/lib/utils";

const FILL: Record<string, string> = { green: "bg-green", cyan: "bg-blue", violet: "bg-purple", pink: "bg-orange" };

function Quiz() {
  const { weekends } = useClock();
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const answer = (s: number) => {
    setScore(score + s);
    if (i + 1 < quiz.length) setI(i + 1);
    else setDone(true);
  };
  const reset = () => {
    setI(0);
    setScore(0);
    setDone(false);
  };

  const recStep = quizResult(score);
  // never recommend a step that's already passed — fall forward to the next open one
  const rec = weekends.find((w) => w.step >= recStep && w.status !== "completed") ?? weekends[weekends.length - 1];

  return (
    <div className="box-2 shadow-hard" data-reveal>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-6 py-4">
        <h3 className="mono text-sm font-bold">Which step should you start from?</h3>
        {!done && <span className="tag tag-ink">Q{i + 1} / {quiz.length}</span>}
      </div>
      <div className="p-6 md:p-8" aria-live="polite">
        {!done ? (
          <div key={i} className="animate-[pop_0.25s_var(--ease)]">
            <p className="text-2xl font-semibold">{quiz[i].q}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {quiz[i].options.map((o) => (
                <button
                  key={o.label}
                  onClick={() => answer(o.score)}
                  className="group flex min-h-14 items-center justify-between gap-3 border-2 border-ink bg-paper px-4 py-3 text-left transition-[transform,box-shadow] duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--ink)]"
                >
                  {o.label}
                  <ChevronRight size={18} strokeWidth={2} aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="animate-[pop_0.3s_var(--ease)]">
            <p className="meta-label text-ink-3"><Sparkles size={15} strokeWidth={2} aria-hidden /> Your starting step</p>
            <p className="mt-3 text-3xl font-semibold md:text-4xl">
              <span className="bg-yellow px-1">Step {pad2(rec.step)}</span> — {rec.title}
            </p>
            <p className="mt-2 text-ink-3">{rec.topic}. {rec.summary}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={registerHref(rec.slug)} className="btn btn-primary">Claim this step <ArrowRight size={16} strokeWidth={2} /></Link>
              <Link href={`/weekend/${rec.slug}`} className="btn btn-ghost">Details</Link>
              <button onClick={reset} className="btn btn-ghost"><RotateCcw size={16} strokeWidth={2} /> Retake</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Tracks() {
  const { weekends } = useClock();
  return (
    <section id="tracks" aria-labelledby="tracks-title" className="section section-alt">
      <div className="wrap">
        <SectionHeader
          id="tracks-title"
          Icon={Layers}
          eyebrow="Learning tracks"
          title="Four levels. [[Level up]] at your pace."
          lead="Each track bundles the steps that build one layer of skill — Explorer to Summit."
        />
        <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {tracks.map((t, i) => {
            const steps = weekends.filter((w) => w.track === t.id);
            return (
              <li key={t.id} data-reveal style={{ ["--d" as string]: i }} className="box flex flex-col shadow-hard">
                <div className={cn("flex items-center justify-between border-b-2 border-ink px-5 py-3", FILL[t.color])}>
                  <span className="mono font-bold">Lv.{i + 1}</span>
                  <span className="flex items-end gap-1" aria-hidden>
                    {[0, 1, 2, 3].map((b) => (
                      <span key={b} className={cn("w-2 border-2 border-ink", b <= i ? "bg-ink" : "bg-paper")} style={{ height: 8 + b * 5 }} />
                    ))}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-3xl font-semibold">{t.name}</h3>
                  <p className="mono mt-1 font-bold text-ink-3">{t.level}</p>
                  <p className="mt-3 text-ink-2">{t.tagline}</p>
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Skills">
                    {t.skills.map((s) => <li key={s} className="tag">{s}</li>)}
                  </ul>
                  <div className="mt-auto pt-5">
                    <p className="mono mb-1 border-t-2 border-ink pt-4 font-bold text-ink-3">Steps</p>
                    <ul className="text-sm">
                      {steps.map((w) => (
                        <li key={w.slug}>
                          <Link href={`/weekend/${w.slug}`} className="flex min-h-11 items-center gap-2 underline-offset-4 hover:underline lg:min-h-9">
                            <span className="font-mono font-bold">{pad2(w.step)}</span> {w.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-12">
          <Quiz />
        </div>
      </div>
    </section>
  );
}
