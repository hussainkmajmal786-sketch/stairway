"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { revokeClaim } from "@/lib/community/membership-admin-actions";
import { formatDateIST } from "@/lib/community/membership";
import type { VerifiedRow } from "@/lib/community/membership-admin";

export function VerifiedList({ rows }: { rows: VerifiedRow[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<VerifiedRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function revoke() {
    if (!target) return;
    setError(null);
    start(async () => {
      const r = await revokeClaim(target.id);
      if (r.ok) {
        setTarget(null);
        router.refresh();
      } else setError(r.error.message);
    });
  }

  if (rows.length === 0) return <p className="box-2 p-4">No verified members in this view.</p>;
  return (
    <>
      <div className="overflow-x-auto border-2 border-ink bg-paper">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">Verified IEEE members</caption>
          <thead className="bg-paper-2">
            <tr className="border-b-2 border-ink">
              <th scope="col" className="p-3">Member</th>
              <th scope="col" className="p-3">Number</th>
              <th scope="col" className="p-3">Until</th>
              <th scope="col" className="p-3">Method</th>
              <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink/30 align-middle">
                <td className="p-3 font-semibold">{r.full_name} <span className="font-normal text-ink-3">@{r.handle}</span></td>
                <td className="p-3 font-mono">…{r.last4}</td>
                <td className="p-3">{formatDateIST(r.verified_until)}</td>
                <td className="p-3">{r.method === "roster" ? "Roster" : "Reviewed"}</td>
                <td className="p-3 text-right">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setError(null); setTarget(r); }}>
                    Revoke<span className="sr-only"> {r.full_name}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title="Revoke this membership?"
        description={target ? `${target.full_name} will lose the badge, chat access that depends on it, and the name lock. They can claim again.` : ""}
        confirmLabel="Revoke"
        pending={pending}
        error={error}
        onConfirm={revoke}
      />
    </>
  );
}
