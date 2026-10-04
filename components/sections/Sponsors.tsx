import Image from "next/image";
import { Download, Handshake, Mail } from "lucide-react";
import { sponsorTiers, type Sponsor } from "@/data/sponsors";
import { event } from "@/data/event";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/utils";

const sizeCls = {
  xl: "h-36 md:h-44 text-4xl md:text-6xl",
  lg: "h-28 md:h-32 text-2xl md:text-4xl",
  md: "h-24 text-xl md:text-2xl",
  sm: "h-20 text-base md:text-lg",
};
const TIER_TAG: Record<string, string> = { "Title Sponsor": "tag-yellow", Gold: "tag-orange", Silver: "tag-blue" };

function Logo({ s, size }: { s: Sponsor; size: keyof typeof sizeCls }) {
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.name} className={cn("box lift flex items-center justify-center px-6 shadow-hard", sizeCls[size])}>
      {s.logo ? (
        <Image src={s.logo} alt={s.name} width={220} height={80} className="max-h-[60%] w-auto object-contain" />
      ) : (
        <span className="text-center font-semibold tracking-tight">{s.name}</span>
      )}
    </a>
  );
}

export function Sponsors() {
  const partners = sponsorTiers.filter((t) => t.size === "sm").flatMap((t) => t.sponsors);
  const main = sponsorTiers.filter((t) => t.size !== "sm");

  return (
    <section id="sponsors" aria-labelledby="sponsors-title" className="section">
      <div className="wrap">
        <SectionHeader id="sponsors-title" Icon={Handshake} eyebrow="Sponsors & partners" title="The people [[holding the rail.]]" align="center" />
        <div className="space-y-10">
          {main.map((t) => (
            <div key={t.tier} data-reveal>
              <h3 className="mb-4 flex justify-center"><span className={cn("tag", TIER_TAG[t.tier] ?? "tag-outline")}>{t.tier}</span></h3>
              <ul className={cn("grid gap-5", t.size === "xl" ? "mx-auto max-w-2xl" : t.size === "lg" ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
                {t.sponsors.map((s) => (
                  <li key={s.name}><Logo s={s} size={t.size} /></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-14 border-y-2 border-ink bg-paper-2 py-4" data-reveal>
        <h3 className="mono mb-3 text-center font-bold">Community &amp; media partners</h3>
        <div className="marquee" style={{ ["--speed" as string]: "40s" }}>
          {[0, 1].map((k) => (
            <ul key={k} className="marquee-track" aria-hidden={k === 1 || undefined}>
              {partners.map((s) => (
                <li key={s.name} className="shrink-0">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" tabIndex={k === 1 ? -1 : undefined} className="flex h-14 items-center border-2 border-ink bg-paper px-5 font-semibold hover:bg-yellow">
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <div className="wrap mt-14">
        <div className="flex flex-col items-start justify-between gap-6 border-2 border-ink bg-blue p-6 shadow-[6px_6px_0_0_var(--ink)] md:flex-row md:items-center md:p-10" data-reveal>
          <div>
            <h3 className="font-mono text-2xl font-bold uppercase md:text-3xl">Become a sponsor</h3>
            <p className="mt-2 max-w-xl">Put your brand in front of 500+ engineering students across 12 weekends — and help build Kerala&apos;s next generation of AI builders.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {event.sponsorDeckUrl ? (
              <a href={event.sponsorDeckUrl} className="btn btn-primary" download><Download size={16} strokeWidth={2} /> Sponsorship deck</a>
            ) : (
              <a href={`mailto:${event.contact.sponsorEmail}?subject=Sponsorship%20deck%20request`} className="btn btn-primary"><Download size={16} strokeWidth={2} /> Request the deck</a>
            )}
            <a href={`mailto:${event.contact.sponsorEmail}?subject=Sponsoring%20st(AI)rway`} className="btn btn-ghost"><Mail size={16} strokeWidth={2} /> Email us</a>
          </div>
        </div>
      </div>
    </section>
  );
}
