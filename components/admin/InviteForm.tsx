"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { createInviteAction } from "@/lib/admin/people-actions";
import type { AdminError } from "@/lib/admin/result";
import { Field, inputCls } from "@/components/ui/Field";

interface Society { id: string; name: string }

/** Creates an invite and shows the one-time link. The link lives only in this component's state. */
export function InviteForm({ societies }: { societies: Society[] }) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"society_admin" | "super_admin">("society_admin");
  const [societyId, setSocietyId] = useState("");
  const [error, setError] = useState<AdminError | null>(null);
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);
  const [copied, setCopied] = useState("");
  const fe = error?.fieldErrors ?? {};

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLink(null);
    setCopied("");
    start(async () => {
      const r = await createInviteAction({ email, role, societyId: role === "society_admin" ? societyId || undefined : undefined });
      if (!r.ok) return setError(r.error);
      setLink({ url: r.data.url, email: email.trim().toLowerCase() });
      setEmail("");
      router.refresh();
    });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied("Copied.");
    } catch {
      setCopied("Could not copy. Select the link and copy it by hand.");
    }
  };

  return (
    <section aria-labelledby={`${id}-t`} className="box shadow-hard">
      <h2 id={`${id}-t`} className="mono border-b-2 border-ink bg-paper-2 px-5 py-3 font-bold">Invite someone</h2>
      <form onSubmit={submit} className="grid gap-4 p-5">
        <Field id={`${id}-email`} label="Their Google account email" error={fe.email}>
          <input id={`${id}-email`} className={inputCls} type="email" value={email} autoComplete="off" required maxLength={254}
            onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mono mb-1 text-xs font-bold text-ink-3">Role</legend>
          {([["society_admin", "Society admin (one society)"], ["super_admin", "Super admin (everything)"]] as const).map(([v, l]) => (
            <label key={v} className="flex min-h-11 items-center gap-3 font-semibold">
              <input type="radio" name={`${id}-role`} className="h-5 w-5" checked={role === v} onChange={() => setRole(v)} /> {l}
            </label>
          ))}
        </fieldset>
        {role === "society_admin" && (
          <Field id={`${id}-soc`} label="Society" error={fe.societyId}>
            <select id={`${id}-soc`} className={inputCls} value={societyId} required onChange={(e) => setSocietyId(e.target.value)}>
              <option value="">Choose…</option>
              {societies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        {error && <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">{error.message}</p>}
        <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create invite link"}</button></div>
      </form>
      {link && (
        <div className="border-t-2 border-ink bg-paper-2 p-5">
          <p className="font-semibold">Copy this link now. It is shown once and works for 7 days, only for {link.email}.</p>
          <input readOnly aria-label="One-time invite link" className={`${inputCls} mt-3 font-mono text-sm`} value={link.url}
            onFocus={(e) => e.currentTarget.select()} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-secondary" onClick={copy}><Copy size={16} aria-hidden /> Copy link</button>
            <button type="button" className="btn btn-secondary" onClick={() => { setLink(null); setCopied(""); }}>
              <Check size={16} aria-hidden /> Done, hide it
            </button>
            <span aria-live="polite" className="text-sm font-semibold">{copied}</span>
          </div>
        </div>
      )}
    </section>
  );
}
