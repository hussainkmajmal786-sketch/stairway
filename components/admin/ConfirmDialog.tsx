"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, inputCls } from "@/components/ui/Field";

/**
 * Destructive-action confirmation. With `requireText` the confirm button stays disabled until the exact text is
 * typed (case-sensitive). Focus is trapped and restored by Modal; the error is announced with role="alert".
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  requireText,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  requireText?: string;
  pending: boolean;
  error?: string | null;
  onConfirm: (typed: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const id = useId();
  const ready = !requireText || typed === requireText;
  return (
    <Modal open={open} onClose={onClose} label={title} className="max-w-lg">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-3">{description}</p>
      {requireText !== undefined && (
        <Field id={`${id}-confirm`} label={`Type "${requireText}" to confirm`} className="mt-5">
          <input
            id={`${id}-confirm`}
            className={inputCls}
            value={typed}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
          />
        </Field>
      )}
      {error && (
        <p role="alert" className="mt-4 border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
          Keep it
        </button>
        <button type="button" className="btn btn-primary" disabled={!ready || pending} onClick={() => onConfirm(typed)}>
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
