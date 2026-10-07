"use client";

import Link from "next/link";
import { ArrowUp, Mail, MapPin, Phone } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { useClock } from "@/components/providers/ClockProvider";
import { useRegisterHref } from "@/components/registration/useRegisterHref";
import { openSlug } from "@/lib/weekends";
import { StairMark, Wordmark } from "@/components/ui/Logo";
import { Instagram, Linkedin, Whatsapp, Youtube, Github } from "@/components/ui/BrandIcons";
import { SmartLink } from "@/components/ui/SmartLink";

const SOCIALS = [
  { key: "instagram", Icon: Instagram, label: "Instagram" },
  { key: "linkedin", Icon: Linkedin, label: "LinkedIn" },
  { key: "whatsapp", Icon: Whatsapp, label: "WhatsApp" },
  { key: "youtube", Icon: Youtube, label: "YouTube" },
  { key: "github", Icon: Github, label: "GitHub" },
] as const;

const link = "inline-flex min-h-11 items-center underline-offset-4 hover:underline lg:min-h-9";

export function Footer() {
  const { settings: event, societies } = useSiteData();
  const { next } = useClock();
  const registerHref = useRegisterHref();
  const socials = SOCIALS.map(({ key, Icon, label }) => ({ href: event.social[key], Icon, label }));
  return (
    // extra bottom padding keeps content clear of the floating dock
    <footer className="border-t-2 border-ink bg-paper-2 pb-[calc(var(--dock-h)+48px)] pt-16">
      <div className="wrap">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5 text-3xl" aria-label="st(AI)rway home">
              <StairMark size={32} />
              <Wordmark />
            </Link>
            <p className="mt-4 max-w-xs text-ink-2">{event.tagline}</p>
            <p className="mt-4 text-sm text-ink-3">
              Organised by{" "}
              <a className="font-semibold text-ink underline underline-offset-4" href={event.organizer.url} target="_blank" rel="noopener noreferrer">
                {event.organizer.name}
              </a>
              .
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {socials.map(({ href, Icon, label }) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid h-11 w-11 place-items-center border-2 border-ink bg-paper hover:bg-yellow">
                    <Icon size={18} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label="Quick links">
            <h2 className="mono mb-4 font-bold">Quick links</h2>
            <ul>
              {[
                ["/#about", "About"],
                ["/#societies", "Societies"],
                ["/#speakers", "Speakers"],
                ["/gallery", "Gallery"],
                ["/resources", "Resources"],
                ["/#sponsors", "Sponsors"],
                ["/#faq", "FAQ"],
                [registerHref(openSlug(next)), "Register"],
              ].map(([href, label]) => (
                <li key={label}><SmartLink href={href} className={link}>{label}</SmartLink></li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Societies">
            <h2 className="mono mb-4 font-bold">Societies</h2>
            <ul className="grid grid-cols-2 gap-x-4 text-sm lg:grid-cols-1">
              {societies.map((s) => (
                <li key={s.slug} className="min-w-0">
                  <Link href={`/s/${s.slug}`} className="flex min-h-11 w-full min-w-0 items-center gap-2 underline-offset-4 hover:underline lg:min-h-9">
                    <span className="font-mono font-bold">{s.shortName}</span>
                    <span className="truncate">— {s.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="mono mb-4 font-bold">Contact</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-3">
                <Mail size={18} strokeWidth={2} className="shrink-0" aria-hidden />
                <a href={`mailto:${event.contact.email}`} className={`${link} break-all`}>{event.contact.email}</a>
              </li>
              {event.contact.coordinators.map((c) => (
                <li key={c.phone} className="flex gap-3">
                  <Phone size={18} strokeWidth={2} className="mt-3 shrink-0" aria-hidden />
                  <span>
                    <a href={`tel:${c.phone.replace(/\s/g, "")}`} className={link}>{c.phone}</a>
                    <span className="block text-ink-3">{c.name} · {c.role}</span>
                  </span>
                </li>
              ))}
              <li className="flex gap-3 pt-2">
                <MapPin size={18} strokeWidth={2} className="shrink-0" aria-hidden />
                <span>{event.venue.name}, {event.venue.address}</span>
              </li>
            </ul>
            <div className="mt-5 border-2 border-ink shadow-[4px_4px_0_0_var(--ink)]">
              <iframe title={`Map of ${event.venue.name}`} src={event.venue.mapEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="block h-44 w-full grayscale" />
            </div>
          </div>
        </div>

        <p aria-hidden className="mt-16 select-none overflow-hidden whitespace-nowrap text-[18vw] font-semibold leading-[0.8] tracking-[-0.05em] text-ink/[0.07] lg:text-[13rem]">
          st(AI)rway
        </p>

        <div className="mt-6 flex flex-col-reverse items-start justify-between gap-6 border-t-2 border-ink pt-6 sm:flex-row sm:items-center">
          <div className="text-sm text-ink-3">
            <p>© 2026 IEEE SB CEK · Made with ⚡ by the st(AI)rway team</p>
            <p className="flex gap-6">
              <Link href="/code-of-conduct" className={link}>Code of Conduct</Link>
              <Link href="/privacy" className={link}>Privacy Policy</Link>
            </p>
          </div>
          <button
            onClick={() => {
              window.scrollTo({ top: 0 });
              document.getElementById("main")?.focus({ preventScroll: true });
            }}
            className="btn btn-ghost"
          >
            <ArrowUp size={16} strokeWidth={2} /> Back to top
          </button>
        </div>
      </div>
    </footer>
  );
}
