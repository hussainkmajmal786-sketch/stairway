"use client";

import { useEffect, useRef } from "react";
import { Hourglass, PartyPopper } from "lucide-react";

/**
 * Shown once after registering (`?new=1`). States plainly whether the seat is confirmed or waitlisted: a race can
 * waitlist someone who saw free seats on the form. Takes focus so screen readers hear the outcome first, then
 * removes the query from the address bar.
 */
export function NewTicketBanner({ confirmed, position }: { confirmed: boolean; position: number | null }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    // Drop `?new=1` so a reload or Back doesn't show the banner again. Native replaceState updates the URL in sync
    // with the Next router without a server round trip, so this banner (and its focus) stay put.
    const url = new URL(window.location.href);
    if (url.searchParams.has("new")) {
      url.searchParams.delete("new");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      role="status"
      aria-labelledby="new-ticket-title"
      className={`border-2 border-ink p-5 shadow-[4px_4px_0_0_var(--ink)] ${confirmed ? "bg-green" : "bg-yellow"}`}
    >
      <p id="new-ticket-title" className="flex items-center gap-2 text-xl font-semibold">
        {confirmed ? (
          <PartyPopper size={22} strokeWidth={2} aria-hidden />
        ) : (
          <Hourglass size={22} strokeWidth={2} aria-hidden />
        )}
        {confirmed
          ? "You're registered. Your seat is confirmed."
          : `The session filled up, so you're on the waitlist${position != null ? ` at #${position}` : ""}.`}
      </p>
      <p className="mt-2 text-sm">
        {confirmed
          ? "We don't send confirmation emails yet, so download your ticket below or find it any time under My tickets."
          : "You don't have a seat yet. If someone cancels you move up automatically, and this page turns into your ticket. We don't send emails yet, so check back here."}
      </p>
    </section>
  );
}
