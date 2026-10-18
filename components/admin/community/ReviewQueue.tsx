"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleSlash, Copy, ExternalLink, Eye, HelpCircle, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, inputCls } from "@/components/ui/Field";
import { decideClaim, getProofUrl } from "@/lib/community/membership-admin-actions";
import { APPROVAL_COPY, MAX_APPROVAL_DAYS, VALIDATOR_URL, addDays, prescreenChips, validateApproval, type QueueRow } from "@/lib/community/membership-admin";
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
  const [date, setDate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reason, setReason] = useState<RejectReason>("unreadable");
  const [dialog, setDialog] = useState<"reject" | null>(null);
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
  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(row.member_number); // stays in the browser: nothing is sent anywhere
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  function approve(e: React.FormEvent) {
    e.preventDefault();
    const issue = validateApproval({ confirmed, verifiedUntil: date });
    if (issue) {
      setFormError(APPROVAL_COPY[issue]);
      return;
    }
    setFormError(null);
    start(async () => {
      const r = await decideClaim({ claimId: row.id, approve: true, verifiedUntil: date, validatorConfirmed: true });
      if (r.ok) {
        setUrl(null);
        router.refresh();
      } else setFormError(r.error.message);
    });
  }
  function reject() {
    setError(null);
    start(async () => {
      const r = await decideClaim({ claimId: row.id, approve: false, reason });
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
      <div className="grid gap-3 border-2 border-ink bg-paper-2 p-4">
        <p className="mono font-bold">Check in the IEEE Membership Validator</p>
        <dl className="grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-ink-3">Member number</dt>
          <dd className="font-mono text-base font-bold">{row.member_number}</dd>
          <dt className="text-ink-3">Name on profile</dt>
          <dd>{row.full_name}</dd>
          {row.email && (<><dt className="text-ink-3">Email used</dt><dd className="break-all">{row.email}</dd></>)}
        </dl>
        <div className="flex flex-wrap gap-3">
          <a href={VALIDATOR_URL} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary">
            <ExternalLink size={14} aria-hidden /> Open IEEE Membership Validator<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <button type="button" className="btn btn-sm btn-secondary" onClick={copyNumber}>
            <Copy size={14} aria-hidden /> Copy member number
          </button>
          <span role="status" aria-live="polite" className="self-center text-sm font-semibold">{copied ? "Copied" : ""}</span>
        </div>
        <p className="text-sm text-ink-2">
          Look the member up by number or primary email, then check that the status is Active and note the expiry date.
        </p>
      </div>
      <div>
        <p className="mono mb-2 font-bold text-ink-3">AI hint on the photo, not proof</p>
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
        <p className="flex items-center gap-2 text-sm text-ink-3"><CircleSlash size={14} aria-hidden /> No photo attached. A photo is optional supporting evidence.</p>
      )}
      <div className="grid gap-4 border-t-2 border-ink pt-4 md:grid-cols-2">
        <form onSubmit={approve} noValidate className="grid gap-3" aria-label={`Approve ${row.full_name}`}>
          <label className="flex items-start gap-3 font-semibold">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I confirmed active membership in the IEEE Membership Validator</span>
          </label>
          <Field id={`d-${row.id}`} label="Expiry date shown by the Validator" hint="Today or later, up to 2 years ahead." required>
            <input id={`d-${row.id}`} type="date" className={inputCls} value={date} min={today} max={addDays(today, MAX_APPROVAL_DAYS)} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <button type="submit" className="btn btn-primary w-fit" disabled={pending}>Approve</button>
          <p role="alert" className={`font-semibold text-red-ink ${formError ? "" : "hidden"}`}>{formError}</p>
        </form>
        <div className="grid content-start gap-3">
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
        title="Reject this claim?"
        description={`${row.full_name} will be told: ${REASON_LABEL[reason]}.`}
        confirmLabel="Reject"
        pending={pending}
        error={error}
        onConfirm={reject}
      />
    </li>
  );
}

export function ReviewQueue({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) return <p className="box-2 p-4">Nothing is waiting for review.</p>;
  return <ul className="grid gap-5" aria-label="Claims waiting for review">{rows.map((r) => <Card key={r.id} row={r} />)}</ul>;
}
