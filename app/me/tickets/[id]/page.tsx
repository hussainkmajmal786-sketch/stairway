import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { requireOnboarded } from "@/lib/auth/session";
import { getSiteData } from "@/lib/site/load";
import { ticketPath } from "@/lib/registration/cta";
import { getTicket } from "@/lib/registration/server";
import { qrRows } from "@/lib/tickets/qr";
import { CANCEL_BLOCK_COPY, cancelBlock, doorPass, ticketFilename } from "@/lib/tickets/view";
import type { TicketPngData } from "@/lib/tickets/png";
import { longDate, pad2, timeOf } from "@/lib/weekends";
import { TicketCard, type TicketCardData } from "@/components/tickets/TicketCard";
import { TicketActions } from "@/components/tickets/TicketActions";
import { CancelRegistration } from "@/components/tickets/CancelRegistration";
import { NewTicketBanner } from "@/components/tickets/NewTicketBanner";

// Never indexed; the root layout is force-dynamic, so the response is `Cache-Control: private, no-store`.
export const metadata: Metadata = {
  title: "Your ticket",
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

// Request-time clock (the root layout is force-dynamic); a helper so render stays lint-pure.
const requestNow = () => Date.now();

export default async function TicketPage({ params, searchParams }: PageProps<"/me/tickets/[id]">) {
  const [{ id: raw }, sp] = await Promise.all([params, searchParams]);
  // A malformed id can never be a ticket: 404 without touching the session or the database.
  const parsed = z.guid().safeParse(raw);
  if (!parsed.success) notFound();
  const id = parsed.data.toLowerCase();
  // Session first: signed-out (or not onboarded) visitors are redirected before anything is looked up.
  const { user, profile } = await requireOnboarded(ticketPath(id));

  // getTicket filters by user_id = session user (RLS alone would also show a society admin other people's rows),
  // so someone else's id and an unknown id are the same 404.
  const [ticket, { settings, events }] = await Promise.all([getTicket(id, user.id), getSiteData()]);
  if (!ticket) notFound();

  const now = requestNow();
  const ev = events.find((e) => e.id === ticket.event.id) ?? null;
  const pass = doorPass(ticket);
  const confirmed = ticket.status === "confirmed";
  const waitlisted = ticket.status === "waitlisted";
  const rows = pass.kind === "qr" ? qrRows(ticket.ticketCode) : null;
  const code = pass.kind === "qr" ? ticket.ticketCode : null;
  const eyebrow = `${ticket.event.societyShort} · Step ${pad2(ticket.event.step)}`;
  const when = `${longDate(ticket.event.start)} · ${timeOf(ticket.event.start)} – ${timeOf(ticket.event.end)} IST`;
  const venue = [ev?.venue || settings.venue.hall, settings.venue.name].filter(Boolean).join(", ");
  const card: TicketCardData = {
    eyebrow, title: ticket.event.title, when, venue, name: profile.fullName, status: ticket.status,
    waitlistPosition: ticket.waitlistPosition, pass, token: ticket.token, qrRows: rows, code,
    checkedInAt: ticket.checkedInAt,
  };
  const png: TicketPngData | null =
    pass.kind === "none"
      ? null
      : { eyebrow, title: ticket.event.title, when, venue, name: profile.fullName, token: ticket.token, qrRows: rows, code };
  const block = cancelBlock(ticket, now);
  const upcoming = !(Date.parse(ticket.event.end) < now);

  return (
    <div className="grid gap-8">
      <Link href="/me/tickets" className="mono inline-flex min-h-11 items-center gap-2 justify-self-start font-bold text-ink-3 hover:text-ink">
        <ArrowLeft size={14} strokeWidth={2} aria-hidden /> All tickets
      </Link>
      <h1 className="text-3xl font-semibold md:text-4xl">
        {confirmed ? "Your ticket" : waitlisted ? "Your waitlist place" : "Your registration"}
      </h1>
      {sp.new === "1" && (confirmed || waitlisted) && (
        <NewTicketBanner confirmed={confirmed} position={ticket.waitlistPosition} />
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_1fr] lg:items-start">
        <TicketCard t={card} />
        <div className="grid gap-6">
          <TicketActions
            ev={ev}
            png={png}
            filename={ticketFilename(ticket.event.slug)}
            shareText={`I'm climbing st(AI)rway: ${eyebrow}, ${ticket.event.title}`}
            upcoming={upcoming}
          />
          {ev && (
            <Link href={`/events/${encodeURIComponent(ev.slug)}`} className="btn btn-ghost justify-self-start">
              Session details
            </Link>
          )}
          <CancelRegistration
            registrationId={ticket.id}
            waitlisted={waitlisted}
            blocked={block ? CANCEL_BLOCK_COPY[block] : null}
          />
        </div>
      </div>
    </div>
  );
}
