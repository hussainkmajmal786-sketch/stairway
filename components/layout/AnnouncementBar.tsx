"use client";

import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { useClock } from "@/components/providers/ClockProvider";
import { openSlug, pad2, registerHref } from "@/lib/weekends";
import { readStorage, useClientValue } from "@/lib/hooks";
import { SmartLink } from "@/components/ui/SmartLink";

const KEY = "stairway-announce-dismissed";

export function AnnouncementBar() {
  const { settings: event } = useSiteData();
  const { next } = useClock();
  const [dismissed, setDismissed] = useState(false);
  const id = `${KEY}-${next?.slug ?? "none"}`;
  const stored = useClientValue(() => !!readStorage(id), false);

  if (!event.announcement.enabled || dismissed || stored || !next || next.status !== "next") return null;
  const text = event.announcement.text.replace("{step}", pad2(next.step)).replace("{title}", next.title);

  return (
    <div className="on-field relative border-b-2 border-ink bg-field text-paper">
      <div className="wrap flex min-h-10 items-center justify-center py-1.5 pr-12 text-center">
        <SmartLink href={registerHref(openSlug(next), event.registration)} className="mono inline-flex min-h-9 items-center gap-2 text-[0.7rem] font-bold hover:text-yellow">
          <span className="tag tag-yellow !py-0.5">Open</span>
          {text}
          <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </SmartLink>
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
