"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * In-dashboard fallback when tickets can't be loaded (getMyTickets / getTicket throw on a DB error), so a blip keeps
 * the sidebar and offers a retry instead of escalating to global-error. Focus moves to the alert so it is announced.
 * The error message is never shown (production hides it anyway; it is server-side detail).
 */
export default function TicketsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <div className="grid gap-8">
      <h1 className="text-3xl font-semibold md:text-4xl">My tickets</h1>
      <div
        ref={ref}
        tabIndex={-1}
        role="alert"
        className="box-2 grid gap-4 p-5 shadow-[4px_4px_0_0_var(--ink)]"
      >
        <p className="flex items-center gap-2 text-xl font-semibold">
          <AlertTriangle size={22} strokeWidth={2} className="shrink-0" aria-hidden /> We couldn&apos;t load your tickets.
        </p>
        <p className="text-ink-2">Your registrations are safe. This is usually a brief connection problem, so try again.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => retry()} className="btn btn-primary">
            <RotateCw size={16} strokeWidth={2} aria-hidden /> Try again
          </button>
          <Link href="/me" className="btn btn-secondary">Back to overview</Link>
        </div>
      </div>
    </div>
  );
}
