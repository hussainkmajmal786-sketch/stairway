"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Footprints, HelpCircle, Home, Images, Mic2, Ticket, type LucideIcon } from "lucide-react";
import { useClock } from "@/components/providers/ClockProvider";
import { useRegisterHref } from "@/components/registration/useRegisterHref";
import { openSlug } from "@/lib/weekends";
import { cn } from "@/lib/utils";
import { SmartLink } from "@/components/ui/SmartLink";

interface Item {
  id: string;
  label: string;
  Icon: LucideIcon;
}

const ITEMS: Item[] = [
  { id: "top", label: "Home", Icon: Home },
  { id: "societies", label: "Societies", Icon: Footprints },
  { id: "speakers", label: "Speakers", Icon: Mic2 },
  { id: "gallery", label: "Gallery", Icon: Images },
  { id: "faq", label: "FAQ", Icon: HelpCircle },
];

/** The per-session registration pages (/events/<slug>/register) highlight the dock's Register block. */
const isRegisterPath = (p: string) => /^\/events\/[^/]+\/register\/?$/.test(p);

/**
 * Floating bottom dock — the site's primary navigation on every screen size.
 * The active item expands with its label; the rest are icon squares (labels
 * appear from tablet width up). Register is always the yellow block at the end.
 */
export function Dock() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const { next } = useClock();
  const registerHref = useRegisterHref();
  const [spy, setSpy] = useState("top");

  useEffect(() => {
    if (!isHome) return;
    const els = ITEMS.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setSpy(hit.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [isHome]);

  const active = isHome
    ? spy
    : isRegisterPath(pathname)
      ? "register"
      : pathname.startsWith("/events") || pathname.startsWith("/s/")
        ? "societies"
        : pathname.startsWith("/gallery")
          ? "gallery"
          : "";

  const href = (id: string) => (id === "top" ? (isHome ? "#top" : "/") : isHome ? `#${id}` : `/#${id}`);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 z-50 flex justify-center px-3"
      style={{ bottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <ul className="flex items-stretch gap-1.5 border-2 border-ink bg-paper p-1.5 shadow-[4px_4px_0_0_var(--ink)] sm:gap-2">
        {ITEMS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <li key={id}>
              <Link
                href={href(id)}
                aria-label={label}
                aria-current={on ? "page" : undefined}
                title={label}
                className={cn(
                  "flex h-12 min-w-12 items-center justify-center gap-2 border-2 border-ink px-3 font-mono text-[0.72rem] font-bold uppercase tracking-[0.12em] transition-[background,transform] duration-150 hover:-translate-y-0.5",
                  on ? "bg-red" : "bg-paper-2 hover:bg-paper-3",
                )}
              >
                <Icon size={19} strokeWidth={2} aria-hidden />
                {/* active label shows from 420px (fits a 6-item dock); all labels from tablet up */}
                <span className={cn(on ? "hidden min-[420px]:inline" : "hidden md:inline")}>{label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <SmartLink
            href={registerHref(openSlug(next))}
            aria-label="Register"
            aria-current={active === "register" ? "page" : undefined}
            className="flex h-12 min-w-12 items-center justify-center gap-2 border-2 border-ink bg-yellow px-3 font-mono text-[0.72rem] font-bold uppercase tracking-[0.12em] transition-transform duration-150 hover:-translate-y-0.5"
          >
            <Ticket size={19} strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">Register</span>
          </SmartLink>
        </li>
      </ul>
    </nav>
  );
}
