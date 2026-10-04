"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquareQuote, Pause, Play } from "lucide-react";
import { testimonials } from "@/data/testimonials";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/hooks";

export function Testimonials() {
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  const [userPaused, setPaused] = useState<boolean | null>(null);
  const paused = userPaused ?? reduced; // reduced motion starts paused
  const [hover, setHover] = useState(false);
  const touch = useRef<number | null>(null);
  const n = testimonials.length;

  useEffect(() => {
    if (paused || hover) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 6500);
    return () => clearInterval(id);
  }, [paused, hover, n]);

  const t = testimonials[i];
  const btn = "grid h-11 w-11 place-items-center border-2 border-ink bg-paper hover:bg-yellow";

  return (
    <section id="testimonials" aria-labelledby="testimonials-title" className="section section-alt">
      <div className="wrap">
        <SectionHeader id="testimonials-title" Icon={MessageSquareQuote} eyebrow="From the climbers" title="Heard on the [[stairway.]]" />
        <div
          className="box shadow-[6px_6px_0_0_var(--ink)]"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touch.current === null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            if (Math.abs(dx) > 50) setI((x) => (x + (dx < 0 ? 1 : -1) + n) % n);
            touch.current = null;
          }}
          role="region"
          aria-roledescription="carousel"
          aria-label="Participant testimonials"
          data-reveal
        >
          <div className="min-h-[280px] p-6 md:min-h-[240px] md:p-12" aria-live={paused ? "polite" : "off"}>
            <blockquote key={i} className="animate-[pop_0.3s_var(--ease)]">
              <p className="max-w-4xl text-2xl font-medium leading-snug tracking-tight md:text-4xl">
                <span className="mr-1 bg-yellow px-1 font-mono" aria-hidden>“</span>
                {t.quote}
              </p>
              <footer className="mt-8 flex items-center gap-4">
                <Avatar name={t.name} photo={t.photo} size={52} />
                <div>
                  <cite className="font-semibold not-italic">{t.name}</cite>
                  <p className="text-sm text-ink-3">{t.detail}</p>
                  <p className="mono mt-0.5 text-[0.66rem] font-bold text-blue-ink">{t.step}</p>
                </div>
              </footer>
            </blockquote>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-ink px-6 py-3">
            <div className="flex gap-1" role="tablist" aria-label="Choose testimonial">
              {testimonials.map((_, k) => (
                <button key={k} role="tab" aria-selected={k === i} aria-label={`Testimonial ${k + 1}`} onClick={() => setI(k)} className="grid h-11 w-8 place-items-center">
                  <span className={cn("block h-3 border-2 border-ink transition-all duration-200", k === i ? "w-7 bg-ink" : "w-3 bg-paper")} />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPaused(!paused)} className={btn} aria-label={paused ? "Resume auto-play" : "Pause auto-play"}>
                {paused ? <Play size={16} strokeWidth={2} /> : <Pause size={16} strokeWidth={2} />}
              </button>
              <button onClick={() => setI((x) => (x - 1 + n) % n)} className={btn} aria-label="Previous testimonial">
                <ChevronLeft size={18} strokeWidth={2} />
              </button>
              <button onClick={() => setI((x) => (x + 1) % n)} className={btn} aria-label="Next testimonial">
                <ChevronRight size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
