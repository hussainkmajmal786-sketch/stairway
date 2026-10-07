import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Countdown } from "@/components/ui/Countdown";
import type { NextStep } from "@/lib/tickets/list";

/** Overview card: the next session the user holds a seat (or a waitlist place) for, with a countdown and ticket link. */
export function NextTicketCard({ next, failed = false }: { next: NextStep | null; failed?: boolean }) {
  return (
    <section className="box shadow-hard" aria-labelledby="next-ticket-title">
      <div className="border-b-2 border-ink bg-yellow px-5 py-3">
        <h2 id="next-ticket-title" className="mono font-bold">Your next step</h2>
      </div>
      {next ? (
        <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <p className="mono font-bold text-ink-3">{next.eyebrow}</p>
            <p className="mt-1 break-words text-2xl font-semibold">{next.title}</p>
            <p className="mt-1 text-ink-2">{next.when}</p>
            {next.waitlisted && (
              <p className="mt-2 text-sm">
                You&apos;re on the waitlist{next.waitlistPosition != null ? ` at #${next.waitlistPosition}` : ""}, so you
                don&apos;t have a seat yet.
              </p>
            )}
            <Link href={next.href} className="btn btn-primary mt-4">
              {next.waitlisted ? "View waitlist status" : "Open ticket"} <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          </div>
          {next.live ? (
            <p className="tag tag-red justify-self-start">Happening now</p>
          ) : (
            <Countdown target={next.start} size="sm" label={`until ${next.title}`} />
          )}
        </div>
      ) : failed ? (
        <div className="p-5">
          <p className="text-ink-2">We couldn&apos;t load your tickets just now.</p>
          <Link href="/me/tickets" className="btn btn-ghost mt-4">
            Go to My tickets <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="p-5">
          <p className="text-ink-2">You haven&apos;t registered for an upcoming session yet.</p>
          <Link href="/#societies" className="btn btn-ghost mt-4">
            Find your next step <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}
