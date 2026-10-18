"use client";

import { useId, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { searchPeopleAction } from "@/lib/admin/people-actions";
import { anonymiseUserAction } from "@/lib/admin/anonymise-action";
import { Field, inputCls } from "@/components/ui/Field";
import { ConfirmDialog } from "./ConfirmDialog";

interface Person { id: string; handle: string; fullName: string; college: string }

/** Erase a person's data: search, pick, type their handle. Shows what is erased and what stays. */
export function AnonymiseForm() {
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNote("");
    start(async () => {
      const r = await searchPeopleAction({ q });
      if (!r.ok) return setError(r.error.message);
      setResults(r.data);
      if (r.data.length === 0) setNote("No one found.");
    });
  };
  const erase = () =>
    start(async () => {
      if (!picked) return;
      setError(null);
      const r = await anonymiseUserAction({ userId: picked.id, confirmHandle: picked.handle });
      if (!r.ok) return setError(r.error.message);
      setNote(
        `Erased. ${r.data.registrationsKept} registration record(s) kept for finance.` +
          (r.data.avatarsRemoved ? "" : " Warning: profile pictures may still be in storage; remove them by hand."),
      );
      setPicked(null);
      setResults([]);
      setQ("");
    });

  return (
    <section aria-labelledby={`${id}-t`} className="box shadow-hard">
      <h2 id={`${id}-t`} className="mono border-b-2 border-ink bg-paper-2 px-5 py-3 font-bold">Erase a person&apos;s data</h2>
      <div className="grid gap-4 p-5">
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <p className="mono text-xs font-bold text-ink-3">What is erased</p>
            <p>Name, picture, headline, bio, college, branch, year, skills, links, projects, experience, phone, email, IEEE id and registration answers. Sign-in is closed for good.</p>
          </div>
          <div>
            <p className="mono text-xs font-bold text-ink-3">What stays</p>
            <p>Registration ids, status, amounts, receipt numbers, payment ids, ticket codes, timestamps, the payment ledger and the audit log. Fund Easy keeps its own copy of already-synced details. Admins and yourself cannot be erased, and people with a live seat or open payment must be cancelled or refunded first.</p>
          </div>
        </div>
        <form onSubmit={search} className="flex flex-wrap items-end gap-3">
          <Field id={`${id}-q`} label="Find by handle or name" className="min-w-56 flex-1">
            <input id={`${id}-q`} className={inputCls} value={q} minLength={2} maxLength={60} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
          </Field>
          <button type="submit" className="btn btn-secondary" disabled={pending || q.trim().length < 2}><Search size={16} aria-hidden /> Search</button>
        </form>
        {error && !picked && <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">{error}</p>}
        <p aria-live="polite" className="min-h-5 text-sm font-semibold">{note}</p>
        {results.length > 0 && (
          <ul className="divide-y-2 divide-ink border-2 border-ink">
            {results.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <span><span className="font-semibold">{p.fullName}</span> <span className="text-ink-3">@{p.handle}{p.college ? `, ${p.college}` : ""}</span></span>
                <button type="button" className="btn btn-secondary" onClick={() => { setError(null); setPicked(p); }}>Erase…</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={picked !== null}
        onClose={() => setPicked(null)}
        title="Erase this person's data?"
        description="This cannot be undone. Their details are removed and they can no longer sign in."
        confirmLabel="Erase data"
        requireText={picked?.handle ?? ""}
        pending={pending}
        error={picked ? error : null}
        onConfirm={erase}
      />
    </section>
  );
}
