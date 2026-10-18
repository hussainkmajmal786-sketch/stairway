import Link from "next/link";
import { CalendarPlus, ScanLine, Users } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { OverviewSchema } from "@/lib/admin/overview";
import { listAdminSocieties, pickSociety } from "@/lib/admin/societies";
import { paymentsConfig } from "@/lib/payments/config";
import { formatInr } from "@/lib/payments/money";
import { formatDate } from "@/lib/weekends";
import { SocietySwitcher } from "@/components/admin/SocietySwitcher";
import { StatCard } from "@/components/admin/StatCard";

const when = (iso: string) => formatDate(iso, { weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  const { ctx, db } = await requireAdmin("/admin");
  const sp = await searchParams;
  const societies = await listAdminSocieties(db, ctx);
  const selected = pickSociety(societies, sp.society) ?? (!ctx.isSuper && societies.length === 1 ? societies[0] : null);

  const { data, error } = await db.rpc("admin_overview", selected ? { p_society_id: selected.id } : {});
  const parsed = OverviewSchema.safeParse(data);
  const showRevenue = paymentsConfig().enabled;

  return (
    <div className="grid gap-8">
      <header className="grid gap-4">
        <div>
          <p className="mono font-bold text-ink-3">Admin</p>
          <h1 className="text-3xl font-semibold md:text-4xl">Overview</h1>
        </div>
        <SocietySwitcher
          basePath="/admin"
          societies={societies}
          current={selected?.slug ?? null}
          allowAll={ctx.isSuper}
        />
      </header>

      {error || !parsed.success ? (
        <p role="alert" className="box border-red-ink p-4 font-semibold">
          The overview could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <Body o={parsed.data} showRevenue={showRevenue} isSuper={ctx.isSuper} />
      )}
    </div>
  );
}

function Body({ o, showRevenue, isSuper }: { o: ReturnType<typeof OverviewSchema.parse>; showRevenue: boolean; isSuper: boolean }) {
  const pct = Math.round(Math.min(1, Math.max(0, o.fill_rate)) * 100);
  return (
    <>
      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registrations this week" value={String(o.registrations_7d)} />
        <StatCard label="Fill rate" value={`${pct}%`} note="Confirmed seats across upcoming published sessions">
          <div
            role="meter"
            aria-label="Fill rate"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-3 h-3 border-2 border-ink bg-paper-2"
          >
            <div className="h-full bg-field" style={{ width: `${pct}%` }} />
          </div>
        </StatCard>
        {showRevenue && <StatCard label="Revenue" value={formatInr(o.revenue_paise)} note="Net confirmed paid amount" />}
        {isSuper && (
          <StatCard label="Refunds pending" value={String(o.refunds_pending)}>
            {o.refunds_pending > 0 && (
              <Link href="/admin/events" className="mt-2 inline-block min-h-11 py-2 text-sm font-semibold underline">
                Find them in a session&apos;s registrations
              </Link>
            )}
          </StatCard>
        )}
      </section>

      <section aria-labelledby="up-title" className="box shadow-hard">
        <h2 id="up-title" className="mono border-b-2 border-ink bg-paper-2 px-5 py-3 font-bold">
          Upcoming sessions
        </h2>
        {o.upcoming.length === 0 ? (
          <div className="p-5">
            <p className="mb-3">No upcoming sessions yet.</p>
            <Link href="/admin/events/new" className="btn btn-primary btn-sm">
              <CalendarPlus size={16} strokeWidth={2} aria-hidden /> Create the first session
            </Link>
          </div>
        ) : (
          <ul className="divide-y-2 divide-ink">
            {o.upcoming.map((e) => (
              <li key={e.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{e.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
                    <span className="tag tag-field">{e.society}</span>
                    <span>{when(e.starts_at)}</span>
                    <span className="tag">{e.status === "published" ? "Published" : "Draft"}</span>
                    <span>
                      {e.confirmed}/{e.capacity} confirmed
                    </span>
                    {e.waitlisted > 0 && <span>+{e.waitlisted} waitlisted</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/events/${e.id}`} className="btn btn-secondary btn-sm">
                    Edit
                  </Link>
                  <Link href={`/admin/events/${e.id}/registrations`} className="btn btn-secondary btn-sm">
                    <Users size={16} strokeWidth={2} aria-hidden /> Registrations
                  </Link>
                  <Link href={`/admin/events/${e.id}/check-in`} className="btn btn-secondary btn-sm">
                    <ScanLine size={16} strokeWidth={2} aria-hidden /> Check-in
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ci-title" className="box shadow-hard">
        <h2 id="ci-title" className="mono border-b-2 border-ink bg-paper-2 px-5 py-3 font-bold">
          Recent check-ins
        </h2>
        {o.recent_checkins.length === 0 ? (
          <p className="p-5 text-ink-3">No check-ins yet.</p>
        ) : (
          <ul className="divide-y-2 divide-ink">
            {o.recent_checkins.map((c, i) => (
              <li key={`${c.checked_in_at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                <span className="font-semibold">{c.full_name}</span>
                <span className="text-sm text-ink-3">
                  {c.event} · {when(c.checked_in_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
