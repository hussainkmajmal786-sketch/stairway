import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { statusRows } from "@/lib/admin/status";
import { currentPaymentsStatus } from "@/lib/payments/config";

export default async function AdminSettingsPage() {
  const { db } = await requireAdmin("/admin/settings", { kind: "super" });
  const flag = await db.rpc("admin_payments_flag");
  const rows = statusRows(currentPaymentsStatus(), flag.error ? null : flag.data === true);
  return (
    <div className="grid gap-6">
      <header>
        <p className="mono font-bold text-ink-3">Admin</p>
        <h1 className="text-3xl font-semibold md:text-4xl">Settings and status</h1>
        <p className="mt-2 text-ink-3">Read only. Payments are switched on only via the go-live checklist; this page never changes money settings and never shows secret values.</p>
      </header>
      <ul className="box shadow-hard divide-y-2 divide-ink">
        {rows.map((r) => (
          <li key={r.key} className="flex min-h-12 flex-wrap items-center justify-between gap-3 p-4">
            <span className="font-semibold">{r.label}</span>
            <span className="flex items-center gap-2 font-mono text-sm font-bold">
              {r.ok ? <CircleCheck size={18} aria-hidden /> : <CircleAlert size={18} aria-hidden />} {r.word}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm">Go-live steps are in <code>docs/payments-go-live-checklist.md</code>. Site text and links are edited in <Link className="underline" href="/admin/site/settings">Site content</Link>.</p>
    </div>
  );
}
