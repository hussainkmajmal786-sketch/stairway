"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, inputCls } from "@/components/ui/Field";
import { blockUser, closeThread, unblockUser, type BlockReason } from "@/lib/community/chat-actions";

type Dialog = "close" | "block" | "unblock" | null;

/** Close / block / unblock for one thread. Block and unblock need the word typed; the server re-authorises. */
export function ThreadActions({ threadId, userId, status, blocked }: { threadId: string; userId: string; status: "open" | "closed"; blocked: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState<BlockReason>("abuse");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    start(async () => {
      const r =
        dialog === "close" ? await closeThread(threadId)
        : dialog === "block" ? await blockUser({ userId, reason })
        : await unblockUser(userId);
      if (r.ok) {
        setDialog(null);
        router.refresh();
      } else setError(r.error.message);
    });
  }
  const open = (d: Dialog) => { setError(null); setDialog(d); };

  return (
    <div className="flex flex-wrap gap-3">
      {status === "open" && <button type="button" className="btn btn-secondary min-h-12" onClick={() => open("close")}>Close thread</button>}
      {blocked
        ? <button type="button" className="btn btn-secondary min-h-12" onClick={() => open("unblock")}>Unblock user</button>
        : (
          <div className="flex flex-wrap items-end gap-3">
            <Field id="block-reason" label="Block reason" className="min-w-40">
              <select id="block-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as BlockReason)}>
                <option value="abuse">Abuse</option>
                <option value="spam">Spam</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <button type="button" className="btn btn-secondary min-h-12" onClick={() => open("block")}>Block user</button>
          </div>
        )}

      <ConfirmDialog
        open={dialog === "close"}
        onClose={() => setDialog(null)}
        title="Close this thread?"
        description="The member can reopen it by sending a new message."
        confirmLabel="Close thread"
        pending={pending}
        error={error}
        onConfirm={run}
      />
      <ConfirmDialog
        open={dialog === "block"}
        onClose={() => setDialog(null)}
        title="Block this user from chat?"
        description="The thread is closed and hidden from the member, who cannot send messages until you unblock them."
        confirmLabel="Block user"
        requireText="BLOCK"
        pending={pending}
        error={error}
        onConfirm={run}
      />
      <ConfirmDialog
        open={dialog === "unblock"}
        onClose={() => setDialog(null)}
        title="Unblock this user?"
        description="They regain chat access if they are still eligible."
        confirmLabel="Unblock user"
        requireText="UNBLOCK"
        pending={pending}
        error={error}
        onConfirm={run}
      />
    </div>
  );
}
