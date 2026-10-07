import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireOnboarded } from "@/lib/auth/session";
import { getMyTickets } from "@/lib/registration/server";
import { ticketGroups, type TicketListRow } from "@/lib/tickets/list";
import { TicketListItem } from "@/components/tickets/TicketListItem";
import { CancelledNotice } from "@/components/tickets/CancelledNotice";

export const metadata: Metadata = { title: "My tickets", robots: { index: false, follow: false } };

// Request-time clock (the root layout is force-dynamic); a helper so render stays lint-pure.
const requestNow = () => Date.now();

function TicketList({ rows }: { rows: TicketListRow[] }) {
  return (
    <ul className="grid gap-4">
      {rows.map((r) => (
        <li key={r.id}>
          <TicketListItem row={r} />
        </li>
      ))}
    </ul>
  );
}

export default async function TicketsPage({ searchParams }: PageProps<"/me/tickets">) {
  // Session first: signed-out (or not onboarded) visitors are redirected before anything is looked up.
  const { user } = await requireOnboarded("/me/tickets");
  const [sp, tickets] = await Promise.all([searchParams, getMyTickets(user.id)]);
  // getMyTickets returns active registrations only, so a cancelled one simply drops out of both lists.
  const { upcoming, past } = ticketGroups(tickets, requestNow());

  return (
    <div className="grid gap-8">
      <h1 className="text-3xl font-semibold md:text-4xl">My tickets</h1>
      {sp.cancelled === "1" && <CancelledNotice />}
      <section aria-labelledby="upcoming-title" className="grid gap-4">
        <h2 id="upcoming-title" className="mono font-bold">Upcoming</h2>
        {upcoming.length > 0 ? (
          <TicketList rows={upcoming} />
        ) : (
          <div className="box-2 p-5">
            <p className="text-ink-2">No upcoming sessions yet. Pick a step on the stairway and register.</p>
            <Link href="/#societies" className="btn btn-primary mt-4">
              Find your next step <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        )}
      </section>
      <section aria-labelledby="past-title" className="grid gap-4">
        <h2 id="past-title" className="mono font-bold">Past</h2>
        {past.length > 0 ? (
          <TicketList rows={past} />
        ) : (
          <p className="text-ink-2">Sessions you registered for move here once they end.</p>
        )}
      </section>
    </div>
  );
}
