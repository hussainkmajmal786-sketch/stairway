"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Clock, Mail, Phone, RotateCcw, Undo2, UserCheck, XCircle, Banknote } from "lucide-react";
import { cancelRegistrationAction, checkInAction, undoCheckInAction } from "@/lib/admin/registration-actions";
import { refundRegistrationAction } from "@/lib/admin/refund-action";
import { STATUS_LABEL, type RegistrationStatus } from "@/lib/admin/registrants";
import { ConfirmDialog } from "./ConfirmDialog";

export interface RegistrantView {
  id: string;
  token: string;
  name: string;
  handle: string;
  college: string;
  status: RegistrationStatus;
  checkedInLabel: string | null;
  email: string | null;
  phone: string | null;
  branchYear: string;
  answers: { label: string; value: string }[];
  receipt: string | null;
  paymentId: string | null;
  amountLabel: string | null;
  registeredLabel: string;
  waitlistPosition: number | null;
  canCheckIn: boolean;
  canUndo: boolean;
  canCancel: boolean;
  /** none: no button; disabled: shown with `refundReason`; enabled: live. */
  refund: "none" | "disabled" | "enabled";
  refundReason: string;
}

const STATUS_ICON = {
  confirmed: CheckCircle2,
  waitlisted: Clock,
  pending_payment: Clock,
  refund_needed: RotateCcw,
  cancelled: XCircle,
  refunded: Banknote,
} as const;
const STATUS_TAG: Record<RegistrationStatus, string> = {
  confirmed: "tag tag-green",
  waitlisted: "tag tag-yellow",
  pending_payment: "tag tag-orange",
  refund_needed: "tag tag-red",
  cancelled: "tag tag-outline",
  refunded: "tag tag-blue",
};
const ANSWER_CAP = 300;

function Answer({ label, value }: { label: string; value: string }) {
  const [open, setOpen] = useState(false);
  const long = value.length > ANSWER_CAP;
  return (
    <div>
      <dt className="mono text-xs font-bold text-ink-3">{label}</dt>
      <dd className="break-words text-sm">
        {long && !open ? `${value.slice(0, ANSWER_CAP)}…` : value || "—"}
        {long && (
          <button type="button" className="ml-2 min-h-11 font-bold underline underline-offset-4" onClick={() => setOpen(!open)}>
            {open ? "Show less" : "Show more"}
          </button>
        )}
      </dd>
    </div>
  );
}

/** One registration: a table row on desktop, a stacked card at phone width. All actions re-authorise server side. */
export function RegistrantRow({ eventId, r }: { eventId: string; r: RegistrantView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"cancel" | "refund" | null>(null);
  const Icon = STATUS_ICON[r.status];

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    setNote("");
    setError("");
    start(async () => {
      const out = await fn();
      if (!out.ok) {
        setError(out.error ?? "That did not work.");
        return;
      }
      setDialog(null);
      setNote(out.message ?? "Done.");
      router.refresh();
    });
  };

  const checkIn = () =>
    run(async () => {
      const res = await checkInAction({ eventId, registrationId: r.id });
      if (!res.ok) return { ok: false, error: res.error.message };
      switch (res.data.result) {
        case "checked_in": return { ok: true, message: "Checked in." };
        case "already_checked_in": return { ok: true, message: "Already checked in." };
        case "outside_window": return { ok: false, error: "Check-in opens 24 hours before the session starts." };
        case "event_not_open": return { ok: false, error: "This session is not open for check-in." };
        default: return { ok: false, error: "That attendee cannot be checked in." };
      }
    });
  const undo = () =>
    run(async () => {
      const res = await undoCheckInAction({ registrationId: r.id });
      return res.ok ? { ok: true, message: "Check-in undone." } : { ok: false, error: res.error.message };
    });
  const cancel = () =>
    run(async () => {
      const res = await cancelRegistrationAction({ registrationId: r.id });
      if (!res.ok) return { ok: false, error: res.error.message };
      return {
        ok: true,
        message:
          res.data.status === "refund_needed" ? "Cancelled. The paid seat is now marked refund needed."
          : res.data.promoted > 0 ? `Cancelled. ${res.data.promoted} from the waitlist promoted.`
          : "Cancelled.",
      };
    });
  const refund = () =>
    run(async () => {
      const res = await refundRegistrationAction(r.id);
      if (!res.ok) return { ok: false, error: res.error.message };
      return { ok: true, message: res.data.outcome === "already_refunded" ? "Already refunded." : "Refunded." };
    });

  return (
    <tr className="align-top max-md:mb-3 max-md:block max-md:border-2 max-md:border-ink max-md:bg-paper max-md:p-4">
      <td className="px-3 py-3 font-mono text-sm font-bold max-md:block max-md:p-0">
        <span className="md:hidden mono text-xs text-ink-3">Token </span>
        {r.token || (r.waitlistPosition ? `Waitlist #${r.waitlistPosition}` : "—")}
      </td>
      <td className="min-w-0 px-3 py-3 max-md:mt-2 max-md:block max-md:p-0">
        <p className="break-words font-semibold">{r.name || r.handle}</p>
        <p className="break-words text-sm text-ink-3">{r.college || "—"}</p>
        <details className="mt-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold underline underline-offset-4">Details</summary>
          <dl className="mt-2 grid gap-2">
            <div>
              <dt className="mono text-xs font-bold text-ink-3">Email</dt>
              <dd className="break-all text-sm">
                {r.email ? (
                  <a className="inline-flex min-h-11 items-center gap-2 underline" href={`mailto:${encodeURI(r.email)}`}>
                    <Mail size={14} aria-hidden /> {r.email}
                  </a>
                ) : "—"}
              </dd>
            </div>
            <div>
              <dt className="mono text-xs font-bold text-ink-3">Phone</dt>
              <dd className="text-sm">
                {r.phone ? (
                  <a className="inline-flex min-h-11 items-center gap-2 underline" href={`tel:${r.phone.replace(/[^0-9+]/g, "")}`}>
                    <Phone size={14} aria-hidden /> {r.phone}
                  </a>
                ) : "—"}
              </dd>
            </div>
            {r.branchYear && (
              <div>
                <dt className="mono text-xs font-bold text-ink-3">Branch / year</dt>
                <dd className="text-sm">{r.branchYear}</dd>
              </div>
            )}
            <div>
              <dt className="mono text-xs font-bold text-ink-3">Registered</dt>
              <dd className="text-sm">{r.registeredLabel}</dd>
            </div>
            {r.amountLabel && (
              <div>
                <dt className="mono text-xs font-bold text-ink-3">Amount</dt>
                <dd className="text-sm">{r.amountLabel}</dd>
              </div>
            )}
            {r.receipt && (
              <div>
                <dt className="mono text-xs font-bold text-ink-3">Receipt</dt>
                <dd className="break-all text-sm">{r.receipt}</dd>
              </div>
            )}
            {r.paymentId && (
              <div>
                <dt className="mono text-xs font-bold text-ink-3">Payment id</dt>
                <dd className="break-all font-mono text-sm">{r.paymentId}</dd>
              </div>
            )}
            {r.answers.map((a) => (
              <Answer key={a.label} label={a.label} value={a.value} />
            ))}
          </dl>
        </details>
      </td>
      <td className="px-3 py-3 max-md:mt-2 max-md:block max-md:p-0">
        <span className={STATUS_TAG[r.status]}>
          <Icon size={14} strokeWidth={2} aria-hidden /> {STATUS_LABEL[r.status]}
        </span>
        <p className="mt-1 text-sm text-ink-3">{r.checkedInLabel ? `Checked in ${r.checkedInLabel}` : "Not checked in"}</p>
      </td>
      <td className="px-3 py-3 max-md:mt-2 max-md:block max-md:p-0">
        <div className="flex flex-wrap gap-2">
          {r.canCheckIn && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={checkIn}>
              <UserCheck size={16} aria-hidden /> Check in
            </button>
          )}
          {r.canUndo && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={undo}>
              <Undo2 size={16} aria-hidden /> Undo check-in
            </button>
          )}
          {r.canCancel && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => { setError(""); setDialog("cancel"); }}>
              <Ban size={16} aria-hidden /> Cancel
            </button>
          )}
          {r.refund !== "none" && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pending || r.refund === "disabled"}
              aria-describedby={r.refund === "disabled" ? `refund-why-${r.id}` : undefined}
              onClick={() => { setError(""); setDialog("refund"); }}
            >
              <Banknote size={16} aria-hidden /> Refund {r.amountLabel ?? ""}
            </button>
          )}
        </div>
        {r.refund === "disabled" && (
          <p id={`refund-why-${r.id}`} className="mt-2 text-sm text-ink-3">
            {r.refundReason}
          </p>
        )}
        <p aria-live="polite" className="mt-2 min-h-5 text-sm font-semibold">
          {note}
        </p>
        {error && dialog === null && (
          <p role="alert" className="mt-2 border-2 border-red-ink bg-error-bg p-2 text-sm font-semibold text-red-ink">
            {error}
          </p>
        )}
        <ConfirmDialog
          open={dialog === "cancel"}
          onClose={() => setDialog(null)}
          title="Cancel this registration?"
          description={`${r.name || "This person"} will lose their seat${
            r.amountLabel && r.status === "confirmed" ? ". A paid seat becomes refund needed and the money is not returned automatically" : ""
          }. A person on the waitlist may be promoted.`}
          confirmLabel="Cancel registration"
          pending={pending}
          error={dialog === "cancel" ? error : null}
          onConfirm={cancel}
        />
        <ConfirmDialog
          open={dialog === "refund"}
          onClose={() => setDialog(null)}
          title={`Refund ${r.amountLabel ?? "this payment"}?`}
          description="This sends a full refund to the payer through Razorpay and cannot be undone."
          confirmLabel="Refund in full"
          requireText="refund"
          pending={pending}
          error={dialog === "refund" ? error : null}
          onConfirm={refund}
        />
      </td>
    </tr>
  );
}
