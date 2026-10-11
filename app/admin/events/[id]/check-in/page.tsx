import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { CheckInScanner } from "@/components/admin/CheckInScanner";

export const metadata: Metadata = { title: "Check-in", robots: { index: false, follow: false } };

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = `/admin/events/${id}/check-in`;
  // The society comes from the event row; a society admin of another society gets a 404.
  const { db } = await requireAdmin(path, { kind: "event", eventId: id });
  const { data: ev } = await db
    .from("events")
    .select("title, status, ticket_type, token_prefix, societies(short_name)")
    .eq("id", id)
    .maybeSingle();
  if (!ev) notFound();

  const back = `/admin/events/${id}/registrations`;
  if (ev.status !== "published") {
    return (
      <div className="grid gap-4">
        <Link href={back} className="mono inline-flex min-h-12 items-center font-bold underline underline-offset-4">
          Back to registrations
        </Link>
        <h1 className="text-3xl font-semibold">Check-in</h1>
        <p className="box p-5">
          {ev.status === "cancelled"
            ? "This session is cancelled, so there is nothing to check in."
            : "This session is a draft. Publish it before checking people in."}
        </p>
      </div>
    );
  }

  return (
    <CheckInScanner
      eventId={id}
      title={ev.title}
      societyName={ev.societies?.short_name ?? ""}
      ticketType={ev.ticket_type === "token" ? "token" : "qr"}
      tokenPrefix={ev.token_prefix ?? ""}
      backHref={back}
    />
  );
}
