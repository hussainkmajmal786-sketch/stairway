import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { listAdminSocieties, pickSociety } from "@/lib/admin/societies";
import { EventList, type EventListRow } from "@/components/admin/EventList";
import { SocietySwitcher } from "@/components/admin/SocietySwitcher";

const PAGE_SIZE = 50;
const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "drafts", label: "Drafts" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const requestNow = () => new Date().toISOString();
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function AdminEventsPage({ searchParams }: PageProps<"/admin/events">) {
  const { ctx, db } = await requireAdmin("/admin/events");
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === one(sp.tab))?.key ?? "upcoming";
  const page = Math.min(Math.max(Number.parseInt(one(sp.page) ?? "1", 10) || 1, 1), 1000);
  const societies = await listAdminSocieties(db, ctx);
  const selected = pickSociety(societies, sp.society);
  // Published events are publicly readable, so scope explicitly to the societies this admin manages.
  const scope = selected ? [selected.id] : societies.map((s) => s.id);

  const now = requestNow();
  let q = db
    .from("events")
    .select("id, title, step_number, starts_at, status, capacity, societies(short_name)", { count: "exact" })
    .in("society_id", scope.length > 0 ? scope : ["00000000-0000-0000-0000-000000000000"]);
  if (tab === "upcoming") q = q.eq("status", "published").gte("ends_at", now).order("starts_at", { ascending: true });
  if (tab === "drafts") q = q.eq("status", "draft").order("starts_at", { ascending: true });
  if (tab === "past") q = q.eq("status", "published").lt("ends_at", now).order("starts_at", { ascending: false });
  if (tab === "cancelled") q = q.eq("status", "cancelled").order("starts_at", { ascending: false });
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);

  const ids = (data ?? []).map((e) => e.id);
  const { data: seats } = ids.length
    ? await db.from("event_seat_counts").select("event_id, attending, waitlisted").in("event_id", ids)
    : { data: [] };
  const seatMap = new Map((seats ?? []).map((s) => [s.event_id, s]));
  const rows: EventListRow[] = (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    step: e.step_number,
    society: e.societies?.short_name ?? "",
    startsAt: e.starts_at,
    status: e.status,
    capacity: e.capacity,
    confirmed: seatMap.get(e.id)?.attending ?? 0,
    waitlisted: seatMap.get(e.id)?.waitlisted ?? 0,
  }));

  const base = (p: Partial<{ tab: string; page: number }>) => {
    const params = new URLSearchParams();
    if (selected) params.set("society", selected.slug);
    params.set("tab", p.tab ?? tab);
    if ((p.page ?? 1) > 1) params.set("page", String(p.page));
    return `/admin/events?${params.toString()}`;
  };
  const total = count ?? 0;
  const hasNext = from + PAGE_SIZE < total;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono font-bold text-ink-3">Admin</p>
          <h1 className="text-3xl font-semibold md:text-4xl">Events</h1>
        </div>
        <Link href="/admin/events/new" className="btn btn-primary">
          <CalendarPlus size={16} strokeWidth={2} aria-hidden /> New session
        </Link>
      </header>

      <SocietySwitcher
        basePath="/admin/events"
        societies={societies}
        current={selected?.slug ?? null}
        allowAll={ctx.isSuper || societies.length > 1}
        extraQuery={`tab=${tab}`}
      />

      <nav aria-label="Session status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={base({ tab: t.key })}
            aria-current={t.key === tab ? "page" : undefined}
            className={`chip-btn inline-flex min-h-11 items-center ${t.key === tab ? "bg-ink text-paper" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {error ? (
        <p role="alert" className="box p-4 font-semibold">
          Sessions could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <EventList rows={rows} emptyHref="/admin/events/new" />
      )}

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="flex items-center gap-3">
          {page > 1 && (
            <Link className="btn btn-secondary btn-sm" href={base({ page: page - 1 })}>
              Previous
            </Link>
          )}
          <span className="text-sm text-ink-3">
            Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          {hasNext && (
            <Link className="btn btn-secondary btn-sm" href={base({ page: page + 1 })}>
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
