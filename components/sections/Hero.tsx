"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, Hourglass, MapPin } from "lucide-react";
import { Countdown } from "@/components/ui/Countdown";
import { Button } from "@/components/ui/Button";
import { useClock } from "@/components/providers/ClockProvider";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { pad2, registerHref, shortDate, timeOf } from "@/lib/weekends";
import { cn } from "@/lib/utils";

// number colours cycle through the text-safe accents
const STAT_COLORS = ["text-blue-ink", "text-green-ink", "text-red-ink", "text-purple-ink", "text-amber-ink"];

export function Hero() {
  const { settings: event, stats } = useSiteData();
  const { next } = useClock();

  return (
    <section id="top" aria-labelledby="hero-title" className="relative">
      <div className="wrap pb-14 pt-12 md:pb-20 md:pt-20">
        <p className="eyebrow fade-up" style={{ ["--d" as string]: 0 }}>
          Kottayam · IEEE SB CEK · Weekend AI series
        </p>

        <h1 id="hero-title" aria-label="st(AI)rway" className="h-hero blur-in mt-6 whitespace-nowrap font-display">
          <span aria-hidden>st</span>
          <span aria-hidden className="mx-[0.03em] inline-block border-[3px] border-ink bg-yellow px-[0.06em] shadow-[6px_6px_0_0_var(--ink)]">
            (AI)
          </span>
          <span aria-hidden>rway</span>
        </h1>

        <p className="fade-up mt-8 max-w-2xl text-[clamp(1.3rem,2.6vw,1.9rem)] font-light leading-snug" style={{ ["--d" as string]: 2 }}>
          {event.tagline} Workshops, labs, talks and a 24-hour hackathon — one step every weekend at College of Engineering Kidangoor.
        </p>

        <div className="fade-up mt-9 flex flex-col gap-3 sm:flex-row" style={{ ["--d" as string]: 3 }}>
          <Button href={registerHref(next.slug)} size="lg" trackAs="register_click" trackProps={{ from: "hero" }}>
            Claim your step <ArrowRight size={18} strokeWidth={2} />
          </Button>
          <Button href="#societies" variant="ghost" size="lg">
            <ArrowDown size={18} strokeWidth={2} /> Explore the societies
          </Button>
        </div>

        {/* next step panel */}
        <div className="fade-up mt-12 max-w-3xl border-2 border-ink bg-paper-2 shadow-[4px_4px_0_0_var(--ink)]" style={{ ["--d" as string]: 4 }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-5 py-3">
            <span className="flex items-center gap-2">
              <span className="tag tag-red"><Hourglass size={12} strokeWidth={2.5} aria-hidden /> Next step</span>
              <span className="tag tag-outline">Step {pad2(next.step)}</span>
            </span>
            <span className="meta-label text-ink-3">
              <MapPin size={14} strokeWidth={2} aria-hidden /> {shortDate(next.start)} · {timeOf(next.start)}
            </span>
          </div>
          <div className="flex flex-col gap-6 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Link href={`/events/${next.slug}`} className="text-2xl font-semibold underline-offset-4 hover:underline md:text-3xl">
                {next.title}
              </Link>
              <p className="mono mt-1 text-ink-3">{next.topic}</p>
            </div>
            <Countdown target={next.start} size="sm" />
          </div>
        </div>
      </div>

      {/* stats strip */}
      <dl className="grid grid-cols-2 border-y-2 border-ink bg-paper md:grid-cols-5">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "flex flex-col-reverse border-ink px-5 py-6 md:px-8",
              i < stats.length - 1 && "max-md:border-b-2 md:border-r-2",
              i % 2 === 0 && i < stats.length - 1 && "max-md:border-r-2",
              i === stats.length - 1 && "col-span-2 md:col-span-1",
            )}
          >
            <dt className="mono mt-1 font-bold text-ink-3">{s.label}</dt>
            <dd className={cn("text-5xl font-medium tracking-tight md:text-6xl", STAT_COLORS[i % STAT_COLORS.length])}>
              {s.value}
              {s.suffix}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
