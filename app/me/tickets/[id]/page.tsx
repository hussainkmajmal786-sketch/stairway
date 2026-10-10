import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { getAuthState, requireOnboarded } from "@/lib/auth/session";
import { getSiteData } from "@/lib/site/load";
import { paymentsConfig } from "@/lib/payments/config";
import { formatInr } from "@/lib/payments/money";
import { ticketPath } from "@/lib/registration/cta";
import { getTicket } from "@/lib/registration/server";
import { ticketFilename, ticketHeading, ticketView } from "@/lib/tickets/view";
import { TicketCard } from "@/components/tickets/TicketCard";
import { TicketActions } from "@/components/tickets/TicketActions";
import { CancelRegistration } from "@/components/tickets/CancelRegistration";
import { NewTicketBanner } from "@/components/tickets/NewTicketBanner";
import { PaymentPanel } from "@/components/payments/PaymentPanel";
import { AutoRefresh } from "@/components/payments/AutoRefresh";

const ROBOTS = { index: false, follow: false };
const parseId = (raw: string) => {
  const r = z.guid().safeParse(raw);
  return r.success ? r.data.toLowerCase() : null;
};
// One read per request, shared by generateMetadata and the page. Filters by user_id = session user (RLS alone would
// also show a society admin other people's rows), so someone else's id and an unknown id are the same 404.
const loadTicket = cache((id: string, userId: string) => getTicket(id, userId));

// Never indexed; the root layout is force-dynamic, so responses are `Cache-Control: private, no-store`.
export async function generateMetadata({ params }: PageProps<"/me/tickets/[id]">): Promise<Metadata> {
  const id = parseId((await params).id);
  const base: Metadata = { title: "Your ticket", robots: ROBOTS, referrer: "same-origin" };
  if (!id) return base;
  // Look up only for an onboarded session (the page itself redirects everyone else before any lookup).
  const { user, profile } = await getAuthState();
  if (!user || !profile?.onboarded) return base;
  const ticket = await loadTicket(id, user.id);
  return ticket ? { ...base, title: ticketHeading(ticket.status) } : base;
}

// Request-time clock (the root layout is force-dynamic); a helper so render stays lint-pure.
const requestNow = () => Date.now();

export default async function TicketPage({ params, searchParams }: PageProps<"/me/tickets/[id]">) {
  const [{ id: raw }, sp] = await Promise.all([params, searchParams]);
  // A malformed id can never be a ticket: 404 without touching the session or the database.
  const id = parseId(raw);
  if (!id) notFound();
  // Session first: signed-out (or not onboarded) visitors are redirected before anything is looked up.
  const { user, profile } = await requireOnboarded(ticketPath(id));

  const [ticket, { settings, events }] = await Promise.all([loadTicket(id, user.id), getSiteData()]);
  if (!ticket) notFound();

  const ev = events.find((e) => e.id === ticket.event.id) ?? null;
  // ?paid=1: Checkout reported success; the server status below is still the authority.
  const justPaid = sp.paid === "1";
  const view = ticketView(ticket, profile.fullName, settings, ev, requestNow(), justPaid);
  const confirmed = ticket.status === "confirmed";
  const waitlisted = ticket.status === "waitlisted";
  const held = ticket.status === "pending_payment";
  const active = confirmed || waitlisted || held;
  const here = ticketPath(ticket.id);

  return (
    <div className="grid gap-8">
      <Link href="/me/tickets" className="mono inline-flex min-h-11 items-center gap-2 justify-self-start font-bold text-ink-3 hover:text-ink">
        <ArrowLeft size={14} strokeWidth={2} aria-hidden /> All tickets
      </Link>
      <h1 className="text-3xl font-semibold md:text-4xl">{view.heading}</h1>
      {(sp.new === "1" || justPaid) && (confirmed || waitlisted) && (
        <NewTicketBanner confirmed={confirmed} position={ticket.waitlistPosition} />
      )}
      {view.notice.kind === "processing" && <AutoRefresh />}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_1fr] lg:items-start">
        <TicketCard t={view.card} />
        <div className="grid gap-6">
          {view.notice.kind === "pay" &&
            (paymentsConfig().enabled ? (
              <PaymentPanel
                registrationId={ticket.id}
                holdExpiresAt={view.notice.holdExpiresAt}
                amountPaise={view.notice.amountPaise}
                step={ticket.event.step}
                here={here}
              />
            ) : (
              <p role="status" className="box-2 p-4">
                Payments are paused right now. Your seat stays held until the timer runs out; please try again shortly.
              </p>
            ))}
          {active && (
            <TicketActions
              ev={ev}
              png={view.png}
              filename={ticketFilename(ticket.event.slug)}
              shareText={`I'm climbing st(AI)rway: ${view.card.eyebrow}, ${ticket.event.title}`}
              upcoming={view.upcoming}
            />
          )}
          {ev && (
            <Link href={`/events/${encodeURIComponent(ev.slug)}`} className="btn btn-secondary justify-self-start">
              Session details
            </Link>
          )}
          {active && (
            <CancelRegistration
              registrationId={ticket.id}
              waitlisted={waitlisted}
              hold={held}
              paidAmount={confirmed && ticket.amountPaise > 0 ? formatInr(ticket.amountPaise) : undefined}
              blocked={view.cancelBlocked}
              here={here}
            />
          )}
        </div>
      </div>
    </div>
  );
}
