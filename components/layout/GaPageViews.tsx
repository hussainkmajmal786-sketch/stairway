"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { analyticsPath } from "@/lib/analytics";

/** Sends a scrubbed page_view on client navigations (the first one is sent by the inline bootstrap). */
export function GaPageViews() {
  const pathname = usePathname();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const p = analyticsPath(pathname);
    if (prev.current === null) {
      prev.current = p;
      return;
    }
    if (prev.current === p) return;
    const referrer = `${window.location.origin}${prev.current}`;
    prev.current = p;
    window.gtag?.("event", "page_view", {
      page_location: `${window.location.origin}${p}`,
      page_path: p,
      page_referrer: referrer,
    });
  }, [pathname]);
  return null;
}
