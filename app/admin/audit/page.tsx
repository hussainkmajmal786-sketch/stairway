import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { AUDIT_PAGE_SIZE, auditRange, parseAuditFilters } from "@/lib/admin/audit";
import { AuditTable, type AuditRow } from "@/components/admin/AuditTable";
import { Field, inputCls } from "@/components/ui/Field";

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const { db } = await requireAdmin("/admin/audit", { kind: "super" });
  const sp = await searchParams;
  const f = parseAuditFilters(sp);
  const [from, to] = auditRange(f.page);

  let q = db.from("audit_log").select("id, at, actor_id, actor_label, action, target_type, target_id, society_id, summary")
    .order("at", { ascending: false }).order("id", { ascending: false });
  if (f.actor) q = q.eq("actor_id", f.actor);
  if (f.action) q = q.like("action", `${f.action}%`);
  if (f.targetType) q = q.eq("target_type", f.targetType);
  if (f.from) q = q.gte("at", f.from);
  if (f.to) q = q.lt("at", f.to);
  const { data, error } = await q.range(from, to);

  const all = data ?? [];
  const hasNext = all.length > AUDIT_PAGE_SIZE;
  const page = all.slice(0, AUDIT_PAGE_SIZE);
  const actorIds = [...new Set(page.map((r) => r.actor_id).filter((x): x is string => !!x))];
  const socIds = [...new Set(page.map((r) => r.society_id).filter((x): x is string => !!x))];
  const [{ data: profs }, { data: socs }] = await Promise.all([
    actorIds.length ? db.from("profiles").select("id, handle").in("id", actorIds) : Promise.resolve({ data: [] }),
    socIds.length ? db.from("societies").select("id, short_name").in("id", socIds) : Promise.resolve({ data: [] }),
  ]);
  const handle = new Map((profs ?? []).map((p) => [p.id, `@${p.handle}`]));
  const soc = new Map((socs ?? []).map((s) => [s.id, s.short_name]));
  const rows: AuditRow[] = page.map((r) => ({
    id: r.id, at: r.at, actor: r.actor_id ? (handle.get(r.actor_id) ?? r.actor_label ?? "unknown") : (r.actor_label || "system"),
    action: r.action, targetType: r.target_type, targetId: r.target_id, society: r.society_id ? (soc.get(r.society_id) ?? "") : "",
    summary: r.summary,
  }));

  const val = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const link = (p: number) => {
    const u = new URLSearchParams();
    for (const k of ["actor", "action", "target", "from", "to"]) if (val(k)) u.set(k, val(k));
    u.set("page", String(p));
    return `/admin/audit?${u.toString()}`;
  };

  return (
    <div className="grid gap-6">
      <header>
        <p className="mono font-bold text-ink-3">Admin</p>
        <h1 className="text-3xl font-semibold md:text-4xl">Audit log</h1>
        <p className="mt-2 text-ink-3">Who changed what and when. Times are Asia/Kolkata. Check-ins are not logged here.</p>
      </header>
      <form method="get" className="box grid gap-3 p-4 md:grid-cols-3">
        <Field id="a-action" label="Action starts with"><input id="a-action" name="action" className={inputCls} defaultValue={val("action")} maxLength={60} /></Field>
        <Field id="a-target" label="Target type"><input id="a-target" name="target" className={inputCls} defaultValue={val("target")} maxLength={40} /></Field>
        <Field id="a-actor" label="Actor id (uuid)"><input id="a-actor" name="actor" className={inputCls} defaultValue={val("actor")} maxLength={36} /></Field>
        <Field id="a-from" label="From"><input id="a-from" name="from" type="date" className={inputCls} defaultValue={val("from")} /></Field>
        <Field id="a-to" label="To (inclusive)"><input id="a-to" name="to" type="date" className={inputCls} defaultValue={val("to")} /></Field>
        <div className="flex items-end gap-3"><button type="submit" className="btn btn-primary">Filter</button><Link href="/admin/audit" className="btn btn-secondary">Clear</Link></div>
      </form>
      {error ? <p role="alert" className="box border-red-ink p-4 font-semibold">The audit log could not be loaded.</p> : <AuditTable rows={rows} />}
      <nav aria-label="Pages" className="flex items-center justify-between gap-3">
        {f.page > 1 ? <Link href={link(f.page - 1)} className="btn btn-secondary">Newer</Link> : <span />}
        <span className="text-sm font-semibold">Page {f.page}</span>
        {hasNext ? <Link href={link(f.page + 1)} className="btn btn-secondary">Older</Link> : <span />}
      </nav>
    </div>
  );
}
