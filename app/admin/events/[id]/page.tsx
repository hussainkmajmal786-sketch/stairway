import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { eventRowToFormValues, publishBlockers } from "@/lib/admin/event-schema";
import { EventForm } from "@/components/admin/EventForm";
import { StatusPanel } from "@/components/admin/StatusPanel";

export default async function AdminEventPage({ params }: PageProps<"/admin/events/[id]">) {
  const { id } = await params;
  const path = `/admin/events/${id}`;
  // Scope "event": the society comes from the row; anything the admin does not manage is a 404.
  const { ctx, db } = await requireAdmin(path, { kind: "event", eventId: id });

  const { data: ev } = await db.from("events").select("*").eq("id", id).maybeSingle();
  if (!ev) notFound();

  const [{ data: tracks }, paid, tokens] = await Promise.all([
    db.from("tracks").select("id, name, society_id").eq("society_id", ev.society_id).order("sort_order"),
    db.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", id).gt("amount_paise", 0)
      .in("status", ["pending_payment", "confirmed", "refund_needed"]),
    db.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", id).not("token_number", "is", null),
  ]);

  const values = eventRowToFormValues(ev);
  const blockers = ev.status === "draft"
    ? publishBlockers({
        title: ev.title, topic: ev.topic, venue: ev.venue, mode: ev.mode, capacity: ev.capacity,
        startsAt: ev.starts_at, ticketType: ev.ticket_type, tokenPrefix: ev.token_prefix,
      })
    : [];

  return (
    <div className="grid gap-8">
      <header>
        <Link href="/admin/events" className="mono inline-flex min-h-11 items-center font-bold underline underline-offset-4">
          Back to events
        </Link>
        <h1 className="mt-2 break-words text-3xl font-semibold md:text-4xl">{ev.title}</h1>
        <p className="mt-3 flex flex-wrap gap-3">
          <Link href={`/admin/events/${id}/registrations`} className="btn btn-secondary btn-sm">
            Registrations
          </Link>
          {ev.status === "published" && (
            <Link href={`/events/${ev.slug}`} className="btn btn-secondary btn-sm">
              <ExternalLink size={16} strokeWidth={2} aria-hidden /> View public page
            </Link>
          )}
        </p>
      </header>

      <StatusPanel eventId={id} title={ev.title} status={ev.status} updatedAt={ev.updated_at} blockers={blockers} />

      {ev.status === "cancelled" ? (
        <p className="box p-4">This session is cancelled and can no longer be edited.</p>
      ) : (
        <EventForm
          mode="edit"
          eventId={id}
          societyId={ev.society_id}
          updatedAt={ev.updated_at}
          initial={values}
          isSuper={ctx.isSuper}
          tracks={(tracks ?? []).map((t) => ({ id: t.id, name: t.name, societyId: t.society_id }))}
          locks={{ price: (paid.count ?? 0) > 0, ticket: (tokens.count ?? 0) > 0, slug: ev.status !== "draft" }}
        />
      )}
    </div>
  );
}
