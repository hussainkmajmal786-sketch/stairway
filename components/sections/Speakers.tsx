"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Globe, Mic2, Plus } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import type { SpeakerView as Speaker } from "@/lib/site/types";
import { useClock } from "@/components/providers/ClockProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Linkedin, XLogo } from "@/components/ui/BrandIcons";
import { openSlug, pad2, registerHref, shortDate } from "@/lib/weekends";
import { track } from "@/lib/analytics";

function SocialLinks({ s }: { s: Speaker }) {
  const items = [
    s.links.linkedin && { href: s.links.linkedin, Icon: Linkedin, label: "LinkedIn" },
    s.links.x && { href: s.links.x, Icon: XLogo, label: "X" },
    s.links.website && { href: s.links.website, Icon: (p: { size?: number }) => <Globe size={p.size} strokeWidth={2} />, label: "Website" },
  ].filter(Boolean) as { href: string; Icon: (p: { size?: number }) => React.ReactNode; label: string }[];
  return (
    <div className="flex gap-2">
      {items.map(({ href, Icon, label }) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${s.name} on ${label}`} className="grid h-11 w-11 place-items-center border-2 border-ink bg-paper-2 hover:bg-yellow">
          <Icon size={18} />
        </a>
      ))}
    </div>
  );
}

export function Speakers() {
  const { settings: event, speakers } = useSiteData();
  const { weekends, next } = useClock();
  const [open, setOpen] = useState<Speaker | null>(null);
  const sessionsOf = (id: string) => weekends.filter((w) => w.speakerIds.includes(id));

  return (
    <section id="speakers" aria-labelledby="speakers-title" className="section">
      <div className="wrap">
        <SectionHeader
          id="speakers-title"
          Icon={Mic2}
          eyebrow="Speakers & mentors"
          title="Climb with people who've [[been up there.]]"
          lead="Engineers, researchers and founders who build AI for a living — and remember what the first step felt like."
        />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {speakers.map((s, i) => {
            const tag = sessionsOf(s.id)[0];
            return (
              <li key={s.id} data-reveal style={{ ["--d" as string]: i % 4 }}>
                <button
                  onClick={() => setOpen(s)}
                  className="box lift flex h-full w-full flex-col text-left shadow-hard"
                  aria-label={`${s.name}, ${s.designation} at ${s.organization}. Open full bio`}
                >
                  <div className="relative border-b-2 border-ink">
                    <Avatar name={s.name} photo={s.photo} size={320} className="!aspect-[4/3] !h-auto !w-full !border-0" />
                    {tag && <span className="tag tag-ink absolute left-3 top-3">Step {pad2(tag.step)}</span>}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-xl font-semibold">{s.name}</h3>
                    <p className="mt-1 text-sm text-ink-2">{s.designation}</p>
                    <p className="text-sm text-ink-3">{s.organization}</p>
                    <p className="mono mt-auto pt-4 text-[0.68rem] font-bold text-blue-ink">{s.topic}</p>
                  </div>
                </button>
              </li>
            );
          })}
          <li data-reveal className="flex flex-col justify-between border-2 border-dashed border-ink bg-paper-2 p-6">
            <span className="grid h-12 w-12 place-items-center border-2 border-ink bg-yellow">
              <Plus size={22} strokeWidth={2.5} aria-hidden />
            </span>
            <div className="mt-8">
              <h3 className="text-2xl font-semibold">Want to speak at st(AI)rway?</h3>
              <p className="mt-2 text-sm text-ink-3">Share what you know with 500+ students. Talks, labs and mentoring slots are open.</p>
              <a href={event.speakerFormUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost mt-5">Apply to speak</a>
            </div>
          </li>
        </ul>

        {/* event pattern: a register prompt right after speaker credibility */}
        {next && (
        <div className="mt-12 flex flex-col items-start justify-between gap-5 border-2 border-ink bg-yellow p-6 shadow-hard sm:flex-row sm:items-center md:p-8" data-reveal>
          <div>
            <p className="mono font-bold">Step {pad2(next.step)} · {shortDate(next.start)}</p>
            <p className="mt-1 text-2xl font-semibold">Learn from them this weekend.</p>
            <p className="mt-1 text-sm text-ink-2">{next.seatsLeft} of {next.seatsTotal} seats left for {next.title}.</p>
          </div>
          <Link href={registerHref(openSlug(next), event.registration)} className="btn btn-ink shrink-0" onClick={() => track("register_click", { from: "speakers" })}>
            Claim your step <ArrowUpRight size={16} strokeWidth={2} aria-hidden />
          </Link>
        </div>
        )}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} label={open ? `${open.name} — speaker profile` : "Speaker"}>
        {open && (
          <div>
            <div className="flex flex-col gap-5 pr-12 sm:flex-row sm:items-center">
              <Avatar name={open.name} photo={open.photo} size={104} />
              <div>
                <p className="mono font-bold text-blue-ink">{open.topic}</p>
                <h3 className="mt-1 text-3xl font-semibold">{open.name}</h3>
                <p className="text-ink-2">{open.designation}, {open.organization}</p>
              </div>
            </div>
            <p className="mt-6 text-ink-2">{open.bio}</p>
            <div className="mt-6"><SocialLinks s={open} /></div>
            <div className="mt-8 border-t-2 border-ink pt-6">
              <p className="mono mb-3 font-bold">Sessions</p>
              <ul className="space-y-2">
                {sessionsOf(open.id).map((w) => (
                  <li key={w.slug}>
                    <Link href={`/events/${w.slug}`} className="flex items-center justify-between gap-4 border-2 border-ink bg-paper-2 p-4 hover:bg-yellow" onClick={() => setOpen(null)}>
                      <span>
                        <span className="font-mono text-xs font-bold">Step {pad2(w.step)}</span>
                        <span className="block font-semibold">{w.title}</span>
                      </span>
                      <span className="font-mono text-xs">{shortDate(w.start)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
