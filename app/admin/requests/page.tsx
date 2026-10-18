import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { RequestsTable } from "@/components/admin/community/RequestsTable";
import { Field, inputCls } from "@/components/ui/Field";
import { requireAdmin } from "@/lib/admin/auth";
import {
  INBOX_COLUMNS, KIND_LABEL, REQUESTS_PAGE, REQUEST_KINDS, REQUEST_STATUSES, STATUS_LABEL,
  filterQuery, parseInboxRows, parseRequestFilters,
} from "@/lib/community/requests";

export const metadata: Metadata = { title: "Requests", robots: { index: false, follow: false } };

const one = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "");

export default async function AdminRequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  // Super admin only: society admins and plain users get the 404 page, signed-out visitors go to login.
  const { db } = await requireAdmin("/admin/requests", { kind: "super" });
  const sp = await searchParams;
  const parsed = parseRequestFilters(sp);
  const f = parsed.ok ? parsed.filters : { kind: null, status: null, from: null, to: null, page: 1 };
  const base = filterQuery(sp);

  let q = db.from("community_requests").select(INBOX_COLUMNS, { count: "exact" });
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("created_at", f.from);
  if (f.to) q = q.lt("created_at", f.to);
  const start = (f.page - 1) * REQUESTS_PAGE;
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(start, start + REQUESTS_PAGE - 1);
  const rows = parseInboxRows(data);
  const total = count ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / REQUESTS_PAGE));
  const href = (page: number) => `/admin/requests?${[base, page > 1 ? `page=${page}` : ""].filter(Boolean).join("&")}`;

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-semibold md:text-4xl">Requests</h1>

      <form method="get" action="/admin/requests" className="box grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <Field id="f-kind" label="Kind">
          <select id="f-kind" name="kind" className={inputCls} defaultValue={f.kind ?? ""}>
            <option value="">All kinds</option>
            {REQUEST_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field id="f-status" label="Status">
          <select id="f-status" name="status" className={inputCls} defaultValue={f.status ?? ""}>
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field id="f-from" label="From date">
          <input id="f-from" name="from" type="date" className={inputCls} defaultValue={f.from ? one(sp.from) : ""} />
        </Field>
        <Field id="f-to" label="To date">
          <input id="f-to" name="to" type="date" className={inputCls} defaultValue={f.to ? one(sp.to) : ""} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary min-h-12">Filter</button>
          <Link href="/admin/requests" className="btn btn-secondary min-h-12">Clear</Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-ink-2">{total} request{total === 1 ? "" : "s"}</p>
        <a className="btn btn-sm btn-secondary" href={`/admin/requests/export${base ? `?${base}` : ""}`}>
          <Download size={16} aria-hidden /> Export CSV
        </a>
      </div>

      {error ? (
        <div role="alert" className="border-2 border-red-ink bg-error-bg p-4 font-semibold text-red-ink">
          Requests could not be loaded. <Link className="underline" href={href(f.page)}>Try again</Link>
        </div>
      ) : (
        <RequestsTable rows={rows} />
      )}

      {pages > 1 && (
        <nav aria-label="Requests pages" className="flex items-center gap-3">
          {f.page > 1 && <Link className="btn btn-sm btn-secondary" href={href(f.page - 1)}>Previous</Link>}
          <span className="text-sm text-ink-3">Page {f.page} of {pages}</span>
          {f.page < pages && <Link className="btn btn-sm btn-secondary" href={href(f.page + 1)}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
