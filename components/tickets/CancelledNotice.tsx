"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

/**
 * Shown once after a cancel (`?cancelled=1`, where the cancel action redirects). Takes focus so screen readers hear
 * the outcome first, then drops the query so a reload or Back doesn't show it again (native replaceState keeps the
 * Next router in sync without a server round trip, so the notice and its focus stay put).
 */
export function CancelledNotice() {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const url = new URL(window.location.href);
    if (url.searchParams.has("cancelled")) {
      url.searchParams.delete("cancelled");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  return (
    <p
      ref={ref}
      tabIndex={-1}
      role="status"
      className="box-2 flex items-center gap-2 p-4 font-semibold shadow-[4px_4px_0_0_var(--ink)]"
    >
      <Check size={18} strokeWidth={2.5} className="shrink-0 text-green-ink" aria-hidden /> Your registration was cancelled.
    </p>
  );
}
