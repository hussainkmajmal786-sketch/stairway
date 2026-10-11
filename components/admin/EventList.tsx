import Link from "next/link";
import { Pencil, ScanLine, Users } from "lucide-react";
import { formatDate } from "@/lib/weekends";

export interface EventListRow {
  id: string;
  title: string;
  step: number;
  society: string;
  startsAt: string;
  status: "draft" | "published" | "cancelled";
  capacity: number;
  confirmed: number;
  waitlisted: number;
}

const when = (iso: string) => formatDate(iso, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const STATUS_LABEL = { draft: "Draft", published: "Published", cancelled: "Cancelled" } as const;
const STATUS_TAG = { draft: "tag", published: "tag tag-green", cancelled: "tag tag-red" } as const;

/** Server-rendered list; row actions are plain links (Edit, Registrations, Check-in). */
export function EventList({ rows, emptyHref }: { rows: EventListRow[]; emptyHref?: string }) {
  if (rows.length === 0) {
    return (
      <div className="box p-5">
        <p className="mb-3">No sessions here yet.</p>
        {emptyHref && (
          <Link href={emptyHref} className="btn btn-primary btn-sm">
            Create a session
          </Link>
        )}
      </div>
    );
  }
  return (
    <ul className="box shadow-hard divide-y-2 divide-ink">
      {rows.map((r) => (
        <li key={r.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <p className="flex items-start gap-3">
              <span className="tag tag-field shrink-0">Step {r.step}</span>
              <Link href={`/admin/events/${r.id}`} className="break-words font-semibold underline-offset-4 hover:underline">
                {r.title}
              </Link>
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-3">
              <span className="tag tag-outline">{r.society}</span>
              <span>{when(r.startsAt)}</span>
              <span className={STATUS_TAG[r.status]}>{STATUS_LABEL[r.status]}</span>
              <span>
                {r.confirmed}/{r.capacity} confirmed
              </span>
              {r.waitlisted > 0 && <span>+{r.waitlisted} waitlisted</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/events/${r.id}`} className="btn btn-secondary btn-sm">
              <Pencil size={16} strokeWidth={2} aria-hidden /> Edit
            </Link>
            <Link href={`/admin/events/${r.id}/registrations`} className="btn btn-secondary btn-sm">
              <Users size={16} strokeWidth={2} aria-hidden /> Registrations
            </Link>
            {r.status === "published" && (
              <Link href={`/admin/events/${r.id}/check-in`} className="btn btn-secondary btn-sm">
                <ScanLine size={16} strokeWidth={2} aria-hidden /> Check-in
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
