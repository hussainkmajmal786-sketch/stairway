import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Hourglass, MapPin } from "lucide-react";
import { Countdown } from "@/components/ui/Countdown";
import { Button } from "@/components/ui/Button";
import { StairWordmark } from "@/components/ui/Logo";
import { FieldBand, Frame } from "@/components/ui/Poster";
import { padStep } from "@/lib/design/ghost";
import type { HeroView as HeroViewModel } from "@/lib/design/hero";
import { pad2, shortDate, timeOf } from "@/lib/weekends";
import { cn } from "@/lib/utils";

// number colours cycle through the text-safe accents (default look only: themed strips use one --hero-stat-num colour)
const STAT_COLORS = ["text-blue-ink", "text-green-ink", "text-red-ink", "text-purple-ink", "text-amber-ink"];

export interface HeroViewProps {
  view: HeroViewModel;
  organizerShort: string;
  tagline: string;
  handles: string[];
  stats: { label: string; value: number; suffix: string }[];
  registerHref: string;
  next: { slug: string; title: string; topic: string; step: number; start: string } | null;
  progress: { current: number; total: number };
}

/** Decorative per-theme layers: shapes are drawn by CSS from the theme's --hero-motif* custom properties. */
function HeroDecor() {
  return (
    <div className="hero-decor" aria-hidden="true">
      <i className="hd hd-1" />
      <i className="hd hd-2" />
      <i className="hd hd-3" />
      <i className="hd hd-4" />
    </div>
  );
}

/** The stair as a bar chart of rising risers; the current step is filled. Decorative (aria-hidden), desktop only. */
function Risers({ progress }: { progress: { current: number; total: number } }) {
  const n = Math.min(Math.max(progress.total, 2), 24);
  const cur = Math.min(progress.current, n);
  const slot = 330 / n;
  const w = slot * 0.62;
  return (
    <div className="hero-chart" aria-hidden="true">
      <span className="mono hc-top">{progress.total} · Summit</span>
      <svg viewBox="0 0 330 176" preserveAspectRatio="xMaxYMax meet" focusable="false">
        {Array.from({ length: n }, (_, i) => {
          const h = 16 + (i * 152) / (n - 1);
          return <rect key={i} x={i * slot + (slot - w) / 2} y={172 - h} width={w} height={h} className={i + 1 === cur ? "hc-bar hc-cur" : "hc-bar"} />;
        })}
      </svg>
      <span className="mono hc-cap">
        Fig. 1 — {progress.total} risers · You are on {padStep(progress.current)}
      </span>
    </div>
  );
}

/** The decorative "Step 01 / 12" bars in the logo row. */
function Progress({ progress }: { progress: { current: number; total: number } }) {
  const n = Math.min(Math.max(progress.total, 2), 24);
  return (
    <span className="hero-progress" aria-hidden="true">
      <span className="hp-bars">
        {Array.from({ length: n }, (_, i) => (
          <i key={i} className={i === 0 ? "hp-cur" : undefined} style={{ height: `${6 + (i * 12) / (n - 1)}px` }} />
        ))}
      </span>
      <span className="hp-text">
        Step {padStep(progress.current)} / {padStep(progress.total)}
      </span>
    </span>
  );
}

/**
 * The opening section, presentational: the same markup for every preset. The preset only sets `data-theme` on the
 * wrapper (colours and motifs are CSS custom properties, app/globals.css), so it renders on the server with no flash
 * and needs no client JS. Exactly one h1 (the wordmark); the section is named by it.
 */
export function HeroView({ view, organizerShort, tagline, handles, stats, registerHref, next, progress }: HeroViewProps) {
  const { decor } = view;
  const wordmark = decor ? (
    <div className="stair-wrap">
      <StairWordmark id="hero-title" />
      <svg className="stair-line" viewBox="0 0 100 76" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0 72 H11.1 V62 H18.7 V52 H53 V42 H61.7 V32 H77.9 V22 H89.2 V12 H100" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  ) : (
    <StairWordmark id="hero-title" />
  );

  return (
    <section id="top" aria-labelledby="hero-title" className="hero" data-theme={view.preset} data-decor={decor ? "on" : "off"}>
      <FieldBand
        as="div"
        ghost={view.ghost}
        bands="both"
        decor={decor ? <HeroDecor /> : undefined}
        className="border-b-2 border-ink py-[clamp(64px,10vw,132px)]"
      >
        <div className="wrap">
          <Frame logoText={view.showFrameText} logoTrailing={decor ? <Progress progress={progress} /> : undefined}>
            {decor && <Risers progress={progress} />}
            <div className="mt-[clamp(18px,3vw,30px)]">
              <p className="presents mb-2">
                <b>{organizerShort}</b>
                <small>presents a weekend AI series</small>
              </p>
              {wordmark}
              <p className="mono-wide stair-cap">One weekend · one step · climb into AI</p>
            </div>

            <p className="tagline fade-up mt-[clamp(28px,4vw,44px)]" style={{ ["--d" as string]: 2 }}>
              {tagline} Workshops, labs, talks and a 24-hour hackathon — one step every weekend at College of Engineering Kidangoor.
            </p>

            <div className="fade-up mt-[22px] flex flex-col gap-3 sm:flex-row" style={{ ["--d" as string]: 3 }}>
              <Button href={registerHref} size="lg" trackAs="register_click" trackProps={{ from: "hero" }}>
                {view.primaryCta} <ArrowRight size={18} strokeWidth={2} aria-hidden />
              </Button>
              {/* no icon, as in the mock-up: keeps the label on one line on a 375px phone */}
              <Button href="#societies" variant="ghost" size="lg">
                {view.secondaryCta}
              </Button>
            </div>

            <p className={cn("rule-h soon hero-rule mt-[clamp(30px,4vw,48px)]", view.headline.kind === "custom" && "hero-rule-custom")}>
              {view.headline.kind === "auto" ? (
                <span>
                  {view.headline.lead} <span className="hero-verb">{view.headline.verb}</span> {view.headline.when}
                </span>
              ) : (
                <span>{view.headline.text}</span>
              )}
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
            <div className="fade-up max-w-3xl border-2 border-ink bg-paper shadow-[6px_6px_0_0_var(--ink)]" style={{ ["--d" as string]: 4 } as CSSProperties}>
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
                  <Link href={`/events/${next.slug}`} className="inline-flex min-h-11 items-center text-2xl font-semibold underline-offset-4 hover:underline md:text-3xl">
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
      {view.showStats && stats.length > 0 && (
        <dl className="hero-stats grid grid-cols-2 border-b-2 md:grid-cols-5">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={cn(
                "flex flex-col-reverse px-5 py-6 md:px-8",
                i < stats.length - 1 && "max-md:border-b-2 md:border-r-2",
                i % 2 === 0 && i < stats.length - 1 && "max-md:border-r-2",
                i === stats.length - 1 && "col-span-2 md:col-span-1",
              )}
            >
              <dt className="mono mt-1 font-bold hero-stat-label">{s.label}</dt>
              <dd className={cn("font-display text-5xl leading-none md:text-6xl", decor ? "hero-stat-num" : STAT_COLORS[i % STAT_COLORS.length])}>
                {s.value}
                {s.suffix}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
