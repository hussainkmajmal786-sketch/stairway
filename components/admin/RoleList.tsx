"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { revokeInviteAction, revokeRoleAction } from "@/lib/admin/people-actions";
import { ConfirmDialog } from "./ConfirmDialog";

export interface RoleItem { id: string; label: string; role: string; society: string; isSelf: boolean }
export interface InviteItem { id: string; email: string; role: string; society: string; expires: string }

/** Admin roles (remove needs the person's handle typed) and open invites (revoke). */
export function RoleList({ roles, invites }: { roles: RoleItem[]; invites: InviteItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<RoleItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const removeRole = () =>
    start(async () => {
      if (!target) return;
      setError(null);
      const r = await revokeRoleAction({ roleId: target.id });
      if (!r.ok) return setError(r.error.message);
      setNote("Role removed.");
      setTarget(null);
      router.refresh();
    });
  const revokeInvite = (inviteId: string) =>
    start(async () => {
      setError(null);
      const r = await revokeInviteAction({ inviteId });
      if (!r.ok) return setError(r.error.message);
      setNote("Invite revoked.");
      router.refresh();
    });

  return (
    <div className="grid gap-8">
      <p aria-live="polite" className="min-h-5 text-sm font-semibold">{note}</p>
      {error && !target && <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">{error}</p>}
      <section aria-labelledby="admins-t" className="box shadow-hard">
        <h2 id="admins-t" className="mono border-b-2 border-ink bg-paper-2 px-5 py-3 font-bold">Admins</h2>
        <ul className="divide-y-2 divide-ink">
          {roles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{r.label}{r.isSelf ? " (you)" : ""}</p>
                <p className="text-sm text-ink-3">{r.role === "super_admin" ? "Super admin" : `Society admin, ${r.society}`}</p>
              </div>
              <button type="button" className="btn btn-secondary" disabled={pending || r.isSelf}
                title={r.isSelf ? "Ask another super admin to remove you" : undefined}
                onClick={() => { setError(null); setTarget(r); }}>
                <Trash2 size={16} aria-hidden /> Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="inv-t" className="box shadow-hard">
        <h2 id="inv-t" className="mono border-b-2 border-ink bg-paper-2 px-5 py-3 font-bold">Pending invites</h2>
        {invites.length === 0 ? <p className="p-4 text-ink-3">No open invites.</p> : (
          <ul className="divide-y-2 divide-ink">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="break-all font-semibold">{i.email}</p>
                  <p className="text-sm text-ink-3">{i.role === "super_admin" ? "Super admin" : `Society admin, ${i.society}`} · expires {i.expires}</p>
                </div>
                <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => revokeInvite(i.id)}>Revoke</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title="Remove this admin?"
        description="They lose all admin access immediately. They can be invited again later."
        confirmLabel="Remove admin"
        requireText={target?.label ?? ""}
        pending={pending}
        error={target ? error : null}
        onConfirm={removeRole}
      />
    </div>
  );
}
