import type { ReactNode } from "react";

/** A single number on a cream box. `children` is for a bar or link under the figure. */
export function StatCard({ label, value, note, children }: { label: string; value: string; note?: string; children?: ReactNode }) {
  return (
    <div className="box shadow-hard p-4">
      <p className="mono text-xs font-bold text-ink-3">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
      {children}
    </div>
  );
}
