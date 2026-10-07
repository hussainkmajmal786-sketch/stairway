"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pageViewStep } from "@/lib/analytics";

/**
 * Sends a scrubbed page_view on client navigations (the first one is sent by the inline bootstrap). Before each hit
 * it `set`s the scrubbed page_location / page_referrer so later events (shares, outbound clicks) never carry raw
 * URLs. Query-only changes count (e.g. a new utm_*), but dropping a non-allowlisted key (?new=1) sends nothing.
 */
export function GaPageViews() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const step = pageViewStep(prev.current, window.location.href);
    prev.current = step.prev;
    if (!step.hit) return;
    window.gtag?.("set", step.hit);
    window.gtag?.("event", "page_view", step.hit);
  }, [pathname, search]);
  return null;
}
