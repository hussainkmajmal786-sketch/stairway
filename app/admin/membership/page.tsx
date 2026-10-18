import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { QueueSchema, RosterStatusSchema, VerifiedSchema, parseOr } from "@/lib/community/membership-admin";
import { ReviewQueue } from "@/components/admin/community/ReviewQueue";
import { RosterSection } from "@/components/admin/community/RosterSection";
import { VerifiedList } from "@/components/admin/community/VerifiedList";

export const metadata: Metadata = { title: "Membership", robots: { index: false, follow: false } };

const QUEUE_PAGE = 20;
const VERIFIED_PAGE = 50;
const pageNo = (v: unknown) => {
  const s = typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
  const n = z.coerce.number().int().min(1).max(500).safeParse(s);
  return n.success ? n.data : 1;
};

export default async function AdminMembershipPage({ searchParams }: PageProps<"/admin/membership">) {
  // Super admin only: society admins and plain users get the 404 page, signed-out visitors go to login.
  const { db } = await requireAdmin("/admin/membership", { kind: "super" });
  const sp = await searchParams;
  const qp = pageNo(sp.q);
  const vp = pageNo(sp.v);
  const [roster, queue, verified] = await Promise.all([
    db.rpc("admin_roster_status"),
    db.rpc("admin_membership_queue", { p_limit: QUEUE_PAGE, p_offset: (qp - 1) * QUEUE_PAGE }),
    db.rpc("admin_verified_members", { p_limit: VERIFIED_PAGE, p_offset: (vp - 1) * VERIFIED_PAGE }),
  ]);
  const rs = parseOr(RosterStatusSchema, roster.data, { rows: 0, last_imported_at: null });
  const q = parseOr(QueueSchema, queue.data, { total: 0, rows: [] });
  const v = parseOr(VerifiedSchema, verified.data, { total: 0, rows: [] });
  const failed = !!(roster.error || queue.error || verified.error);

  const link = (key: "q" | "v", n: number) => {
    const u = new URLSearchParams();
    u.set("q", String(key === "q" ? n : qp));
    u.set("v", String(key === "v" ? n : vp));
    return `/admin/membership?${u}`;
  };
  const pager = (key: "q" | "v", page: number, size: number, total: number) => (
    <nav aria-label={key === "q" ? "Review queue pages" : "Verified members pages"} className="flex items-center gap-3">
      {page > 1 && <Link className="btn btn-sm btn-secondary" href={link(key, page - 1)}>Previous</Link>}
      <span className="text-sm text-ink-3">Page {page} of {Math.max(1, Math.ceil(total / size))}</span>
      {page * size < total && <Link className="btn btn-sm btn-secondary" href={link(key, page + 1)}>Next</Link>}
    </nav>
  );

  return (
    <div className="grid gap-10">
      <h1 className="text-3xl font-semibold md:text-4xl">IEEE membership</h1>
      {failed && (
        <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
          Some data could not be loaded. Reload the page to try again.
        </p>
      )}

      <section aria-labelledby="roster-h" className="box grid gap-4 p-5 shadow-hard md:p-6">
        <h2 id="roster-h" className="mono font-bold">Roster</h2>
        <p className="text-ink-2">
          {rs.rows} members on the roster
          {rs.last_imported_at ? `, last imported ${new Date(rs.last_imported_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}` : ""}.
          Members and names are stored only as keyed hashes.
        </p>
        <RosterSection />
      </section>

      <section aria-labelledby="queue-h" className="grid gap-4">
        <h2 id="queue-h" className="mono font-bold">Review queue ({q.total})</h2>
        <ReviewQueue rows={q.rows} />
        {q.total > QUEUE_PAGE && pager("q", qp, QUEUE_PAGE, q.total)}
      </section>

      <section aria-labelledby="verified-h" className="grid gap-4">
        <h2 id="verified-h" className="mono font-bold">Verified members ({v.total})</h2>
        <VerifiedList rows={v.rows} />
        {v.total > VERIFIED_PAGE && pager("v", vp, VERIFIED_PAGE, v.total)}
      </section>
    </div>
  );
}
