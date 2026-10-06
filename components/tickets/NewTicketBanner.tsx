"use client";

import { useEffect, useRef } from "react";
import { Hourglass, PartyPopper } from "lucide-react";

/**
 * Shown once after registering (`?new=1`). States plainly whether the seat is confirmed or waitlisted: a race can
 * waitlist someone who saw free seats on the form. Takes focus so screen readers hear the outcome first.
 */
export function NewTicketBanner({ confirmed, position }: { confirmed: boolean; position: number | null }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      role="status"
      aria-labelledby="new-ticket-title"
      className={`border-2 border-ink p-5 shadow-[4px_4px_0_0_var(--ink)] outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-blue-ink ${confirmed ? "bg-green" : "bg-yellow"}`}
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
