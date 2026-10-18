"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleSlash, Eye, HelpCircle, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, inputCls } from "@/components/ui/Field";
import { decideClaim, getProofUrl } from "@/lib/community/membership-admin-actions";
import { addDays, defaultApprovalDate, prescreenChips, type QueueRow } from "@/lib/community/membership-admin";
import { REJECT_REASONS, todayIST, type RejectReason } from "@/lib/community/membership";

const REASON_LABEL: Record<RejectReason, string> = {
  unreadable: "Image unreadable",
  mismatch: "Name or number does not match",
  expired: "Membership expired",
  not_member: "Not an IEEE member",
  other: "Other",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function Card({ row }: { row: QueueRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const chips = prescreenChips(row.prescreen);
  const [url, setUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [date, setDate] = useState(() => defaultApprovalDate(row.prescreen.expiry));
  const [reason, setReason] = useState<RejectReason>("unreadable");
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayIST();

  function show() {
    setProofError(null);
    start(async () => {
      const r = await getProofUrl(row.id);
      if (r.ok) setUrl(r.data.url);
      else setProofError(r.error.message);
    });
  }
  function decide() {
    setError(null);
    start(async () => {
      const r = await decideClaim(dialog === "approve" ? { claimId: row.id, approve: true, verifiedUntil: date } : { claimId: row.id, approve: false, reason });
      if (r.ok) {
        setDialog(null);
        setUrl(null);
        router.refresh();
      } else setError(r.error.message);
    });
  }

  return (
    <li className="box grid gap-4 p-5 shadow-hard">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{row.full_name} <span className="text-ink-3">@{row.handle}</span></p>
        <p className="text-sm text-ink-3">Submitted {fmt(row.created_at)}</p>
      </div>
      <p>Entered member number: <span className="font-mono font-bold">{row.member_number}</span></p>
      <div>
        <p className="mono mb-2 font-bold text-ink-3">AI hint, not proof</p>
        <ul className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c.text} className={`tag ${c.tone === "good" ? "tag-green" : c.tone === "bad" ? "tag-red" : "tag-outline"}`}>
              {c.tone === "good" ? <CheckCircle2 size={13} aria-hidden /> : c.tone === "bad" ? <XCircle size={13} aria-hidden /> : <HelpCircle size={13} aria-hidden />}
              {c.text}
            </li>
          ))}
        </ul>
      </div>
      {row.has_proof ? (
        <div className="grid gap-2">
          {!url && (
            <button type="button" className="btn btn-sm btn-secondary w-fit" disabled={pending} onClick={show}>
              <Eye size={14} aria-hidden /> Show proof
            </button>
          )}
          {proofError && <p role="alert" className="font-semibold text-red-ink">{proofError}</p>}
          {url && (
            <div className="border-2 border-ink bg-paper-2 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, must not go through the image optimiser */}
              <img src={url} alt={`Membership proof submitted by ${row.full_name}`} referrerPolicy="no-referrer" className="max-h-96 max-w-full object-contain" />
              <p className="mt-2 text-xs text-ink-3">This link expires in 5 minutes. Viewing is recorded in the audit log.</p>
            </div>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ink-3"><CircleSlash size={14} aria-hidden /> No proof image attached.</p>
      )}
      <div className="grid gap-4 border-t-2 border-ink pt-4 md:grid-cols-2">
        <div className="grid gap-3">
          <Field id={`d-${row.id}`} label="Verified until" hint="Up to 740 days from today.">
            <input id={`d-${row.id}`} type="date" className={inputCls} value={date} min={today} max={addDays(today, 740)} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <button type="button" className="btn btn-primary w-fit" disabled={pending || !date} onClick={() => { setError(null); setDialog("approve"); }}>Approve</button>
        </div>
        <div className="grid gap-3">
          <Field id={`r-${row.id}`} label="Reject reason">
            <select id={`r-${row.id}`} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as RejectReason)}>
              {REJECT_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </select>
          </Field>
          <button type="button" className="btn btn-secondary w-fit" disabled={pending} onClick={() => { setError(null); setDialog("reject"); }}>Reject</button>
        </div>
      </div>
      <ConfirmDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "approve" ? "Approve this membership?" : "Reject this claim?"}
        description={
          dialog === "approve"
            ? `${row.full_name} will get the Verified IEEE member badge until ${fmt(`${date}T00:00:00+05:30`)}.`
            : `${row.full_name} will be told: ${REASON_LABEL[reason]}.`
        }
        confirmLabel={dialog === "approve" ? "Approve" : "Reject"}
        pending={pending}
        error={error}
        onConfirm={decide}
      />
    </li>
  );
}

export function ReviewQueue({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) return <p className="box-2 p-4">Nothing is waiting for review.</p>;
  return <ul className="grid gap-5" aria-label="Claims waiting for review">{rows.map((r) => <Card key={r.id} row={r} />)}</ul>;
}
