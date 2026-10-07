"use client";

import Link from "next/link";
import {
  ArrowLeft, ArrowRight, CalendarDays, CalendarPlus, Check, Clock, Download, FileText, Hourglass, ListChecks, MapPin, Mic2, NotebookPen, Package, Trophy, Images, Route,
} from "lucide-react";
import { useClock } from "@/components/providers/ClockProvider";
import { Countdown } from "@/components/ui/Countdown";
import { Button } from "@/components/ui/Button";
import { FormatChip, LevelChip, SeatsBar, StatusChip } from "@/components/ui/Badges";
import { Avatar } from "@/components/ui/Avatar";
import { ShareButtons } from "@/components/ui/ShareButtons";
import { GalleryArt } from "@/components/ui/GalleryArt";
import { Github } from "@/components/ui/BrandIcons";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { SOCIETY_FILL } from "@/lib/events/colors";
import { societyStairway } from "@/lib/events/status";
import { daysUntil, longDate, pad2, timeOf } from "@/lib/weekends";
import { RegisterCta } from "@/components/registration/RegisterCta";
import { useRegisterHref } from "@/components/registration/useRegisterHref";
import type { CtaState } from "@/lib/registration/cta";
import { downloadIcs, googleCalendarUrl } from "@/lib/calendar";
import { cn } from "@/lib/utils";

function Block({ title, Icon, children, id, fill = "bg-paper-2" }: { title: string; Icon: typeof Check; children: React.ReactNode; id?: string; fill?: string }) {
  return (
    <section id={id} className="box shadow-hard" data-reveal aria-labelledby={id ? `${id}-h` : undefined}>
      <h2 id={id ? `${id}-h` : undefined} className={cn("flex items-center gap-3 border-b-2 border-ink px-5 py-3 font-mono text-sm font-bold uppercase tracking-[0.14em]", fill)}>
        <Icon size={16} strokeWidth={2} aria-hidden /> {title}
      </h2>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

/** `cta` is computed on the server for this request (the viewer's own registration + public seat counts). */
export function WeekendDetail({ slug, cta }: { slug: string; cta: CtaState }) {
  const { settings: event, speakers: allSpeakers, gallery } = useSiteData();
  const registerHref = useRegisterHref();
  const speakerById = (id: string) => allSpeakers.find((s) => s.id === id);
  const { weekends, now } = useClock();
  const w = weekends.find((e) => e.slug === slug)!;
  // prev / next walk this event's own society stairway
  const stairway = societyStairway(weekends, w.society.slug);
  const idx = stairway.findIndex((e) => e.slug === slug);
  const prev = stairway[idx - 1];
  const next = stairway[idx + 1];
  const speakers = w.speakerIds.map(speakerById).filter(Boolean);
  const photos = gallery.filter((g) => g.eventSlug === w.slug);
  const done = w.status === "completed";
  const days = daysUntil(w.start, now);

  return (
    <article>
      <header className="pb-10 pt-10 md:pt-14">
        <div className="wrap">
          <nav aria-label="Breadcrumb" className="mono mb-8 font-bold text-ink-3">
            <Link href="/" className="underline-offset-4 hover:underline">Home</Link> <span aria-hidden>/</span>{" "}
            <Link href={`/s/${w.society.slug}`} className="underline-offset-4 hover:underline">{w.society.shortName}</Link> <span aria-hidden>/</span>{" "}
            <span className="text-ink" aria-current="page">Step {pad2(w.step)}</span>
          </nav>
          <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-end">
            <div className={cn("grid h-36 w-36 place-items-center border-2 border-ink shadow-[6px_6px_0_0_var(--ink)] md:h-44 md:w-44", done ? "bg-paper-3" : SOCIETY_FILL[w.society.color])}>
              <span className="text-center font-mono font-bold">
                <span className="mono block">{w.society.shortName} · Step</span>
                <span className="block text-6xl md:text-7xl">{pad2(w.step)}</span>
                <span className="mono block text-ink-3">/ {pad2(stairway.length)}</span>
              </span>
            </div>
            <div>
              <div className="flex flex-wrap gap-2">
                <StatusChip status={w.status} />
                <LevelChip level={w.level} />
                {w.formats.map((f) => <FormatChip key={f} format={f} />)}
                {!done && (
                  <span className="tag tag-red"><Hourglass size={12} strokeWidth={2.5} aria-hidden /> {days === 0 ? "Today" : `In ${pad2(days)} days`}</span>
                )}
              </div>
              <h1 className="mt-4 text-[clamp(2.6rem,7vw,5.5rem)] font-medium leading-[0.95] tracking-[-0.04em]">{w.title}</h1>
              <p className="mono mt-3 text-sm font-bold text-ink-3">{w.topic}</p>
            </div>
          </div>
          <dl className="mt-10 grid border-2 border-ink bg-paper sm:grid-cols-3">
            <div className="border-ink p-4 max-sm:border-b-2 sm:border-r-2">
              <dt className="meta-label text-blue-ink"><CalendarDays size={14} strokeWidth={2} aria-hidden /> When</dt>
              <dd className="mt-1">{longDate(w.start)}</dd>
            </div>
            <div className="border-ink p-4 max-sm:border-b-2 sm:border-r-2">
              <dt className="meta-label text-red-ink"><Clock size={14} strokeWidth={2} aria-hidden /> Time</dt>
              <dd className="mt-1">{timeOf(w.start)} – {timeOf(w.end)} IST</dd>
            </div>
            <div className="p-4">
              <dt className="meta-label text-purple-ink"><MapPin size={14} strokeWidth={2} aria-hidden /> Where</dt>
              <dd className="mt-1">{event.venue.hall}, {event.venue.name}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="wrap grid gap-8 pb-20 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="box p-6 shadow-hard md:p-8" data-reveal>
            <p className="text-lg leading-relaxed text-ink-2">{w.description}</p>
          </section>

          <Block title="You'll be able to…" Icon={ListChecks} fill="bg-yellow">
            <ul className="grid gap-3 sm:grid-cols-2">
              {w.outcomes.map((o) => (
                <li key={o} className="flex gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center border-2 border-ink bg-green"><Check size={12} strokeWidth={3} aria-hidden /></span>
                  {o}
                </li>
              ))}
            </ul>
          </Block>

          <div className="grid gap-8 md:grid-cols-2">
            <Block title="Prerequisites" Icon={Route}>
              <ul className="space-y-2 text-ink-2 [&>li]:ml-5 [&>li]:list-[square]">{w.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul>
            </Block>
            <Block title="What to bring" Icon={Package}>
              <ul className="space-y-2 text-ink-2 [&>li]:ml-5 [&>li]:list-[square]">{w.bring.map((p) => <li key={p}>{p}</li>)}</ul>
            </Block>
          </div>

          <Block title="Agenda" Icon={CalendarDays} id="agenda" fill="bg-blue">
            <ol>
              {w.agenda.map((a) => (
                <li key={a.time + a.title} className="grid grid-cols-[88px_1fr] gap-4 border-b-2 border-dashed border-ink/25 py-3 first:pt-0 last:border-b-0 last:pb-0">
                  <span className="font-mono font-bold">{a.time}</span>
                  <span>
                    <span className="block font-semibold">{a.title}</span>
                    {a.detail && <span className="text-sm text-ink-3">{a.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Block>

          {speakers.length > 0 && (
            <Block title={speakers.length > 1 ? "Speakers & mentors" : "Speaker"} Icon={Mic2}>
              <ul className="grid gap-4 sm:grid-cols-2">
                {speakers.map((s) => (
                  <li key={s!.id} className="flex gap-4">
                    <Avatar name={s!.name} photo={s!.photo} size={64} />
                    <div>
                      <p className="font-semibold">{s!.name}</p>
                      <p className="text-sm text-ink-2">{s!.designation}, {s!.organization}</p>
                      <p className="mt-1 line-clamp-3 text-sm text-ink-3">{s!.bio}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {done && Object.keys(w.resources).length > 0 && (
            <Block title="Resources" Icon={FileText} id="resources" fill="bg-green">
              <div className="flex flex-wrap gap-3">
                {w.resources.slides && <a className="btn btn-sm btn-ghost" href={w.resources.slides} target="_blank" rel="noopener noreferrer"><FileText size={16} strokeWidth={2} /> Slides</a>}
                {w.resources.code && <a className="btn btn-sm btn-ghost" href={w.resources.code} target="_blank" rel="noopener noreferrer"><Github size={16} /> Code</a>}
                {w.resources.notebook && <a className="btn btn-sm btn-ghost" href={w.resources.notebook} target="_blank" rel="noopener noreferrer"><NotebookPen size={16} strokeWidth={2} /> Notebook</a>}
                {w.resources.reading?.map((r) => <a key={r.href} className="btn btn-sm btn-ghost" href={r.href} target="_blank" rel="noopener noreferrer">{r.label}</a>)}
              </div>
              {w.resources.recording && (
                <div id="recording" className="mt-6 aspect-video border-2 border-ink">
                  <iframe src={w.resources.recording} title={`Recording of Step ${w.step}: ${w.title}`} loading="lazy" allowFullScreen className="h-full w-full" />
                </div>
              )}
            </Block>
          )}

          {done && w.winners.length > 0 && (
            <Block title="Winners" Icon={Trophy} fill="bg-orange">
              <ul className="space-y-3">
                {w.winners.map((x, i) => (
                  <li key={x.team} className="flex items-center gap-4 border-2 border-ink p-3">
                    <span className={cn("tag", i === 0 ? "tag-yellow" : "tag-blue")}>{x.place}</span>
                    <span><span className="block font-semibold">{x.team}</span><span className="text-sm text-ink-3">{x.project}</span></span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {done && photos.length > 0 && (
            <Block title="Highlights" Icon={Images}>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {photos.map((p) => (
                  <li key={p.id} className="relative aspect-square overflow-hidden border-2 border-ink">
                    <GalleryArt item={p} sizes="(max-width:768px) 50vw, 25vw" />
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="Venue" Icon={MapPin}>
            <p className="text-ink-2">{event.venue.hall}, {event.venue.name}<br />{event.venue.address}</p>
            <div className="mt-5 border-2 border-ink">
              <iframe title={`Map of ${event.venue.name}`} src={event.venue.mapEmbed} loading="lazy" className="block h-72 w-full grayscale" />
            </div>
            <a href={event.venue.mapLink} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Open in Google Maps →</a>
          </Block>
        </div>

        {/* sticky action rail */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
          <div className={cn("border-2 border-ink p-6 shadow-[6px_6px_0_0_var(--ink)]", done ? "bg-paper-2" : "bg-yellow")} data-reveal>
            {done ? (
              <>
                <p className="mono font-bold text-green-ink">Climbed ✓</p>
                <p className="mt-2 text-ink-2">This step is complete. Grab the resources, then claim the next one.</p>
                {next && (
                  <Button href={next.status === "completed" ? `/events/${next.slug}` : registerHref(next.slug)} className="mt-6 w-full">
                    Step {pad2(next.step)}: {next.title} <ArrowRight size={16} strokeWidth={2} />
                  </Button>
                )}
              </>
            ) : (
              <>
                <p className="mono mb-4 font-bold">{w.status === "next" ? "Starts in" : "Unlocks in"}</p>
                <Countdown target={w.start} size="sm" />
                <div className="mt-6 border-2 border-ink bg-paper p-3">
                  <SeatsBar seatsLeft={w.seatsLeft} seatsTotal={w.seatsTotal} />
                </div>
                <div className="mt-6">
                  <RegisterCta state={cta} step={w.step} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <a href={googleCalendarUrl(w, event)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost !px-2">
                    <CalendarPlus size={16} strokeWidth={2} /> Google
                  </a>
                  <button onClick={() => downloadIcs(w, event)} className="btn btn-sm btn-ghost !px-2">
                    <Download size={16} strokeWidth={2} /> .ics
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="box p-6 shadow-hard" data-reveal>
            <p className="mono mb-3 font-bold">Share this step</p>
            <ShareButtons path={`/events/${w.slug}`} text={`st(AI)rway Step ${pad2(w.step)}: ${w.title} — ${w.topic}`} />
          </div>
        </aside>
      </div>

      <nav aria-label="Step navigation" className="border-t-2 border-ink bg-paper-2">
        <div className="wrap grid grid-cols-2">
          {prev ? (
            <Link href={`/events/${prev.slug}`} className="group flex flex-col gap-1 py-8 pr-4">
              <span className="mono inline-flex items-center gap-2 font-bold text-ink-3"><ArrowLeft size={14} strokeWidth={2} aria-hidden /> Step {pad2(prev.step)}</span>
              <span className="text-lg font-semibold underline-offset-4 group-hover:underline md:text-2xl">{prev.title}</span>
            </Link>
          ) : <span />}
          {next ? (
            <Link href={`/events/${next.slug}`} className="group flex flex-col items-end gap-1 border-l-2 border-ink py-8 pl-4 text-right">
              <span className="mono inline-flex items-center gap-2 font-bold text-ink-3">Step {pad2(next.step)} <ArrowRight size={14} strokeWidth={2} aria-hidden /></span>
              <span className="text-lg font-semibold underline-offset-4 group-hover:underline md:text-2xl">{next.title}</span>
            </Link>
          ) : <span />}
        </div>
      </nav>
    </article>
  );
}
