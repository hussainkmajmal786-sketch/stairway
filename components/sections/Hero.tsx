"use client";

import Link from "next/link";
import { ArrowRight, Hourglass, MapPin } from "lucide-react";
import { Countdown } from "@/components/ui/Countdown";
import { Button } from "@/components/ui/Button";
import { StairWordmark } from "@/components/ui/Logo";
import { FieldBand, Frame } from "@/components/ui/Poster";
import { useClock } from "@/components/providers/ClockProvider";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { useRegisterHref } from "@/components/registration/useRegisterHref";
import { ghostWord } from "@/lib/design/ghost";
import { heroHandles, ruleHead } from "@/lib/design/hero";
import { openSlug, pad2, shortDate, timeOf } from "@/lib/weekends";
import { cn } from "@/lib/utils";

// number colours cycle through the text-safe accents
const STAT_COLORS = ["text-blue-ink", "text-green-ink", "text-red-ink", "text-purple-ink", "text-amber-ink"];

/**
 * The poster: a framed cobalt field with the extruded stair-step wordmark (the page's only h1), the next step's rule
 * head and the handles row. The next-step panel (countdown) and the stats strip follow on cream so they stay easy
 * to read. All three stay inside the #top section (the dock's scroll-spy target).
 */
export function Hero() {
  const { settings: event, stats } = useSiteData();
  const { next, now } = useClock();
  const registerHref = useRegisterHref();
  const head = ruleHead(next, now);
  const handles = heroHandles(event);

  return (
    <section id="top" aria-labelledby="hero-title">
      <FieldBand as="div" ghost={ghostWord({ kind: "home" })} bands="both" className="border-b-2 border-ink py-[clamp(64px,10vw,132px)]">
        <div className="wrap">
          <Frame>
            <div className="mt-[clamp(18px,3vw,30px)]">
              <p className="presents mb-2">
                <b>{event.organizer.short}</b>
                <small>presents a weekend AI series</small>
              </p>
              <StairWordmark id="hero-title" />
              <p className="mono-wide stair-cap">One weekend · one step · climb into AI</p>
            </div>

            <p className="tagline fade-up mt-[clamp(28px,4vw,44px)]" style={{ ["--d" as string]: 2 }}>
              {event.tagline} Workshops, labs, talks and a 24-hour hackathon — one step every weekend at College of Engineering Kidangoor.
            </p>

            <div className="fade-up mt-[22px] flex flex-col gap-3 sm:flex-row" style={{ ["--d" as string]: 3 }}>
              <Button href={registerHref(openSlug(next))} size="lg" trackAs="register_click" trackProps={{ from: "hero" }}>
                Claim your step <ArrowRight size={18} strokeWidth={2} aria-hidden />
              </Button>
              {/* no icon, as in the mock-up: keeps the label on one line on a 375px phone */}
              <Button href="#societies" variant="ghost" size="lg">
                Explore the societies
              </Button>
            </div>

            <p className="rule-h soon mt-[clamp(30px,4vw,48px)]">
              <span>
                {head.lead} <span className="text-yellow">{head.verb}</span> {head.when}
              </span>
            </p>
            {handles.length > 0 && (
              <p className="mono mt-3.5 flex flex-wrap justify-center gap-x-[18px] gap-y-1.5 text-center max-[400px]:text-[0.64rem] max-[400px]:tracking-[0.08em]">
                {handles.map((h) => (
                  <span key={h} className="min-w-0 [overflow-wrap:anywhere]">
                    {h}
                  </span>
                ))}
              </p>
            )}
          </Frame>
        </div>
      </FieldBand>

      {/* next step panel, on cream */}
      {next && (
        <div className="border-b-2 border-ink bg-paper-2">
          <div className="wrap py-10 md:py-12">
            <div className="fade-up max-w-3xl border-2 border-ink bg-paper shadow-[6px_6px_0_0_var(--ink)]" style={{ ["--d" as string]: 4 }}>
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
                <div className="min-w-0">
                  <Link href={`/events/${next.slug}`} className="text-2xl font-semibold underline-offset-4 hover:underline md:text-3xl">
                    {next.title}
                  </Link>
                  <p className="mono mt-1 text-ink-3">{next.topic}</p>
                </div>
                <Countdown target={next.start} size="sm" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* stats strip */}
      <dl className="grid grid-cols-2 border-b-2 border-ink bg-paper md:grid-cols-5">
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
            <dd className={cn("font-display text-5xl leading-none md:text-6xl", STAT_COLORS[i % STAT_COLORS.length])}>
              {s.value}
              {s.suffix}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
