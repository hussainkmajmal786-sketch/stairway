"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { useClock } from "@/components/providers/ClockProvider";
import { pad2, registerHref } from "@/lib/weekends";
import { readStorage, useClientValue } from "@/lib/hooks";

const KEY = "stairway-announce-dismissed";

export function AnnouncementBar() {
  const { settings: event } = useSiteData();
  const { next } = useClock();
  const [dismissed, setDismissed] = useState(false);
  const id = `${KEY}-${next.slug}`;
  const stored = useClientValue(() => !!readStorage(id), false);

  if (!event.announcement.enabled || dismissed || stored || next.status !== "next") return null;
  const text = event.announcement.text.replace("{step}", pad2(next.step)).replace("{title}", next.title);

  return (
    <div className="relative border-b-2 border-ink bg-ink text-paper">
      <div className="wrap flex min-h-10 items-center justify-center py-1.5 pr-12 text-center">
        <Link href={registerHref(next.slug)} className="mono inline-flex min-h-9 items-center gap-2 text-[0.7rem] font-bold hover:text-yellow">
          <span className="tag tag-yellow !py-0.5">Open</span>
          {text}
          <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <button
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(id, "1");
          } catch {}
        }}
        className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center hover:text-yellow"
        aria-label="Dismiss announcement"
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
