import { RequestRow } from "./RequestRow";
import type { InboxRow } from "@/lib/community/requests";

/** Header row (md+) and the list of expandable rows. The header is decorative: each row's button carries the text. */
export function RequestsTable({ rows }: { rows: InboxRow[] }) {
  if (rows.length === 0) return <p className="box-2 p-4">No requests match these filters.</p>;
  return (
    <div className="border-2 border-ink bg-paper">
      <div aria-hidden className="hidden border-b-2 border-ink bg-paper-2 p-3 font-mono text-xs font-bold uppercase tracking-[0.12em] md:grid md:grid-cols-[9rem_9rem_1fr_12rem_7rem_1.5rem] md:gap-3">
        <span>Received (IST)</span><span>Kind</span><span>Subject</span><span>From</span><span>Status</span><span />
      </div>
      <ul aria-label="Requests">
        {rows.map((r) => <RequestRow key={r.id} row={r} />)}
      </ul>
    </div>
  );
}
