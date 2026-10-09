"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Check, MapPin, Star } from "lucide-react";
import { useClock } from "@/components/providers/ClockProvider";
import { Countdown } from "@/components/ui/Countdown";
import { Button } from "@/components/ui/Button";
import { FormatChip, LevelChip, SeatsBar } from "@/components/ui/Badges";
import { Avatar } from "@/components/ui/Avatar";
import { ShareButtons } from "@/components/ui/ShareButtons";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { longDate, openSlug, pad2, registerHref, timeOf } from "@/lib/weekends";

/** Featured block for the next step — a "poster" on the left, details on a yellow panel. */
export function NextWeekend() {
  const { settings: event, speakers: allSpeakers } = useSiteData();
  const speakerById = (id: string) => allSpeakers.find((s) => s.id === id);
  const { next, weekends } = useClock();
  if (!next) return null;
  const stairwayLength = weekends.filter((e) => e.society.slug === next.society.slug).length;
  const speakers = next.speakerIds.map(speakerById).filter(Boolean);

  return (
    <section id="next" aria-labelledby="next-title" className="section section-alt">
      <div className="wrap">
        <p className="eyebrow mb-6" data-reveal>
          <Star size={16} strokeWidth={2} aria-hidden /> Don&apos;t miss this one
        </p>
        <div data-reveal className="grid border-2 border-ink shadow-[6px_6px_0_0_var(--ink)] lg:grid-cols-[0.85fr_1.15fr]">
          {/* poster */}
          <div className="relative flex min-h-[320px] min-w-0 flex-col justify-between overflow-hidden border-ink bg-paper p-6 max-lg:border-b-2 lg:border-r-2 md:p-8">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <rect key={i} x={i * 16.66} y={86 - i * 13} width="16.66" height={14 + i * 13} fill={i === 5 ? "#FFB200" : i % 2 ? "#E2D8C8" : "#ECE4D7"} stroke="#100F0D" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            <span className="relative tag tag-ink self-start">Step {pad2(next.step)} / {stairwayLength}</span>
            <div className="relative">
              <p className="font-mono text-[clamp(5rem,14vw,9rem)] font-bold leading-none">{pad2(next.step)}</p>
              <p className="mt-2 max-w-[14ch] text-2xl font-semibold">{next.title}</p>
            </div>
          </div>

          {/* details */}
          <div className="min-w-0 bg-yellow p-6 md:p-8">
            <div className="flex flex-wrap gap-2">
              <LevelChip level={next.level} />
              {next.formats.map((f) => <FormatChip key={f} format={f} />)}
            </div>
            <h2 id="next-title" className="mt-4 font-mono text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold uppercase leading-tight tracking-[-0.02em]">
              {next.title}
            </h2>
            <p className="mono mt-1 font-bold">{next.topic}</p>
            <p className="mt-4 text-ink-2">{next.description}</p>

            <ul className="mt-5 space-y-2">
              {next.outcomes.slice(0, 3).map((o) => (
                <li key={o} className="flex gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center border-2 border-ink bg-paper"><Check size={12} strokeWidth={3} aria-hidden /></span>
                  {o}
                </li>
              ))}
            </ul>

            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-sm font-bold">
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} strokeWidth={2} aria-hidden /> {longDate(next.start)} · {timeOf(next.start)}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin size={15} strokeWidth={2} aria-hidden /> {event.venue.hall}</span>
            </p>

            <div className="mt-6"><Countdown target={next.start} size="sm" /></div>

            {speakers.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-4">
                {speakers.map((s) => (
                  <li key={s!.id} className="flex items-center gap-3">
                    <Avatar name={s!.name} photo={s!.photo} size={44} />
                    <span className="text-sm">
                      <span className="block font-semibold">{s!.name}</span>
                      {s!.organization}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <SeatsBar seatsLeft={next.seatsLeft} seatsTotal={next.seatsTotal} className="mt-6" />

            <div className="mt-6 flex flex-wrap gap-3">
              <Button href={registerHref(openSlug(next), event.registration)} variant="ink" trackAs="register_click" trackProps={{ from: "spotlight", step: next.step }}>
                Claim your step <ArrowRight size={16} strokeWidth={2} />
              </Button>
              <Link href={`/events/${next.slug}`} className="btn btn-secondary">Find out more</Link>
            </div>

            <div className="mt-6 border-t-2 border-ink pt-5">
              <p className="mono mb-3 font-bold">Share with a friend</p>
              <ShareButtons path={`/events/${next.slug}`} text={`Join me at st(AI)rway Step ${pad2(next.step)}: ${next.title}`} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
