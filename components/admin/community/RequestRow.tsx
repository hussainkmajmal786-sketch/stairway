"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronDown, Handshake, MessageSquareText, type LucideIcon } from "lucide-react";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { updateRequest } from "@/lib/community/requests-actions";
import { KIND_LABEL, NOTE_MAX, REQUEST_STATUSES, STATUS_LABEL, type InboxRow, type RequestKind, type RequestStatus } from "@/lib/community/requests";

const KIND_ICON: Record<RequestKind, LucideIcon> = { host_event: CalendarPlus, partner: Handshake, feedback: MessageSquareText };
const STATUS_TONE: Record<RequestStatus, string> = { new: "bg-yellow", in_review: "bg-paper-2", resolved: "bg-green", closed: "bg-paper" };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function RequestRow({ row }: { row: InboxRow }) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RequestStatus>(row.status);
  const [note, setNote] = useState(row.adminNote);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const Icon = KIND_ICON[row.kind];
  const from = row.anonymous ? "Anonymous" : [row.name, row.organisation].filter(Boolean).join(" · ") || "Unknown";

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await updateRequest({ id: row.id, status, note });
      if (r.ok) {
        setMsg({ ok: true, text: "Saved." });
        router.refresh();
      } else setMsg({ ok: false, text: r.error.message });
    });
  }

  return (
    <li className="border-b-2 border-ink last:border-b-0">
      <button
        type="button"
        className="grid min-h-14 w-full gap-1 p-3 text-left hover:bg-paper-2 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ink md:grid-cols-[9rem_9rem_1fr_12rem_7rem_1.5rem] md:items-center md:gap-3"
        aria-expanded={open}
        aria-controls={`${uid}-detail`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm text-ink-3">{fmt(row.createdAt)}</span>
        <span className="inline-flex items-center gap-1.5 font-semibold"><Icon size={16} strokeWidth={2} aria-hidden /> {KIND_LABEL[row.kind]}</span>
        <span className="min-w-0 break-words font-semibold">{row.subject}</span>
        <span className="min-w-0 break-words text-sm">{from}</span>
        <span className={`inline-flex w-fit items-center border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold uppercase ${STATUS_TONE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
        <ChevronDown size={18} aria-hidden className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <div id={`${uid}-detail`} className="grid gap-5 border-t-2 border-ink bg-paper-2 p-4 md:p-5">
          <div>
            <h3 className="mono mb-2 font-bold">Message</h3>
            {/* plain text only: React escapes it, whitespace is preserved, never dangerouslySetInnerHTML */}
            <p className="whitespace-pre-wrap break-words">{row.message}</p>
          </div>
          {row.details.length > 0 && (
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              {row.details.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold capitalize">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div>
            <h3 className="mono mb-2 font-bold">Contact</h3>
            {row.anonymous ? (
              <p>Sent anonymously. No sender information is stored.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {row.name && <li>{row.name}{row.organisation ? ` · ${row.organisation}` : ""}</li>}
                {row.email && <li><a className="underline underline-offset-4" href={`mailto:${row.email}`} rel="noopener">{row.email}</a></li>}
                {row.phone && <li>{row.phone}</li>}
              </ul>
            )}
          </div>
          <form onSubmit={save} className="grid gap-4 md:max-w-xl">
            <Field id={`${uid}-status`} label="Status">
              <select id={`${uid}-status`} className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as RequestStatus)}>
                {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field id={`${uid}-note`} label="Internal note" hint={`${note.length}/${NOTE_MAX}. Only admins see this.`}>
              <textarea id={`${uid}-note`} className={textareaCls} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>{pending ? "Saving" : "Save"}</button>
              <p role="status" aria-live="polite" className={msg && !msg.ok ? "font-semibold text-red-ink" : "font-semibold"}>
                {msg?.text ?? ""}
              </p>
            </div>
          </form>
        </div>
      )}
    </li>
  );
}
