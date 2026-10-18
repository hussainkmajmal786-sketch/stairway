"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import { cancelEventAction, deleteDraftEventAction, duplicateEventAction, setEventStatusAction } from "@/lib/admin/event-actions";
import type { AdminError } from "@/lib/admin/result";
import { ConfirmDialog } from "./ConfirmDialog";

type Dialog = "cancel" | "delete" | null;

/** Lifecycle controls: publish / unpublish, duplicate, cancel (title must be typed), delete a draft. */
export function StatusPanel({
  eventId,
  title,
  status,
  updatedAt,
  blockers,
}: {
  eventId: string;
  title: string;
  status: "draft" | "published" | "cancelled";
  updatedAt: string;
  blockers: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<AdminError | null>(null);
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: AdminError; done?: () => void; message?: string }>) => {
    setError(null);
    setNote("");
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? null);
        return;
      }
      if (r.message) setNote(r.message);
      setDialog(null);
      r.done?.();
    });
  };

  const setStatus = (next: "published" | "draft") =>
    run(async () => {
      const r = await setEventStatusAction({ id: eventId, status: next, seenUpdatedAt: updatedAt });
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, message: next === "published" ? "Published." : "Moved back to draft.", done: () => router.refresh() };
    });

  const cancelled = status === "cancelled";
  return (
    <section aria-labelledby="status-title" className="box shadow-hard">
      <h2 id="status-title" className="mono border-b-2 border-ink bg-paper-2 px-5 py-3 font-bold">
        Status: {status === "published" ? "Published" : status === "draft" ? "Draft" : "Cancelled"}
      </h2>
      <div className="grid gap-4 p-5">
        {error && dialog === null && (
          <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
            {error.message}
          </p>
        )}
        <p aria-live="polite" className="min-h-5 text-sm font-semibold">
          {note}
        </p>

        {status === "draft" && (
          <div>
            <button type="button" className="btn btn-primary" disabled={pending || blockers.length > 0} onClick={() => setStatus("published")}>
              <Eye size={16} strokeWidth={2} aria-hidden /> Publish
            </button>
            {blockers.length > 0 && (
              <div className="mt-3">
                <p className="mono text-xs font-bold text-ink-3">Before you can publish</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {status === "published" && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setStatus("draft")}>
            <EyeOff size={16} strokeWidth={2} aria-hidden /> Unpublish (back to draft)
          </button>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await duplicateEventAction(eventId);
                if (!r.ok) return { ok: false, error: r.error };
                return { ok: true, done: () => router.push(`/admin/events/${r.data.id}`) };
              })
            }
          >
            <Copy size={16} strokeWidth={2} aria-hidden /> Duplicate
          </button>
          {!cancelled && (
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setDialog("cancel")}>
              <Ban size={16} strokeWidth={2} aria-hidden /> Cancel session
            </button>
          )}
          {status === "draft" && (
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setDialog("delete")}>
              <Trash2 size={16} strokeWidth={2} aria-hidden /> Delete draft
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title="Cancel this session?"
        description="Registrations are cancelled and waitlisted people are released. Paid seats are flagged for refund. This cannot be undone."
        confirmLabel="Cancel session"
        requireText={title}
        pending={pending}
        error={dialog === "cancel" ? error?.message : null}
        onConfirm={(typed) =>
          run(async () => {
            const r = await cancelEventAction({ id: eventId, confirmTitle: typed });
            if (!r.ok) return { ok: false, error: r.error };
            const { cancelled: n, refundNeeded, waitlisted } = r.data;
            return {
              ok: true,
              message: `${n} cancelled, ${refundNeeded} paid seats need refunds in Registrations, ${waitlisted} waitlisted released.`,
              done: () => router.refresh(),
            };
          })
        }
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title="Delete this draft?"
        description="The draft is removed for good. Sessions with registrations cannot be deleted."
        confirmLabel="Delete draft"
        pending={pending}
        error={dialog === "delete" ? error?.message : null}
        onConfirm={() =>
          run(async () => {
            const r = await deleteDraftEventAction(eventId);
            if (!r.ok) return { ok: false, error: r.error };
            return { ok: true, done: () => router.push("/admin/events") };
          })
        }
      />
    </section>
  );
}
