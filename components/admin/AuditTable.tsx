import { summaryPairs } from "@/lib/admin/audit";

export interface AuditRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string | null;
  society: string;
  summary: unknown;
}

/** Plain-text audit rows (React escapes everything). Cards under 640px, table above. */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) return <p className="box p-4 text-ink-3">No entries match.</p>;
  return (
    <ul className="box shadow-hard divide-y-2 divide-ink">
      {rows.map((r) => (
        <li key={r.id} className="grid gap-1 p-4">
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono text-sm font-bold">{r.action}</span>
            <time dateTime={r.at} className="text-sm text-ink-3">{new Date(r.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</time>
          </p>
          <p className="text-sm">
            By <span className="font-semibold">{r.actor}</span> on {r.targetType}
            {r.targetId ? <span className="break-all font-mono"> {r.targetId}</span> : null}
            {r.society ? <> · {r.society}</> : null}
          </p>
          {summaryPairs(r.summary).length > 0 && (
            <p className="break-words font-mono text-xs text-ink-3">
              {summaryPairs(r.summary).map((p) => `${p.key}=${p.value}`).join("  ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
