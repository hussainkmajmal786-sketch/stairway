"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Field, fieldDescribedBy, inputCls, textareaCls } from "@/components/ui/Field";
import { track } from "@/lib/analytics";
import { submitCommunityRequest } from "@/lib/community/forms-actions";
import { buildPayload, contactFields, errorKey, firstInvalid, type FormKind, type RawValues } from "@/lib/community/form-ui";

const MSG_MAX = 2000;
const ORDER: Record<FormKind, string[]> = {
  host_event: ["name", "email", "phone", "organisation", "event_title", "expected_attendees", "preferred_date", "venue", "website", "subject", "message"],
  partner: ["name", "email", "phone", "organisation", "partnership_type", "website", "subject", "message"],
  feedback: ["category", "name", "email", "phone", "organisation", "subject", "message"],
};

/** One of the three request forms. All state is local; the server action re-validates everything. */
export function CommunityForm({ kind, idPrefix = "gi" }: { kind: FormKind; idPrefix?: string }) {
  const [values, setValues] = useState<RawValues>({});
  const [anonymous, setAnonymous] = useState(false);
  const [hp, setHp] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  // Time-to-submit check: captured on mount, reset after each successful submit.
  const startedAt = useRef<number | null>(null);
  if (startedAt.current === null) startedAt.current = Date.now();
  const fid = (k: string) => `${idPrefix}-${kind}-${k}`;
  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const v = (k: string) => values[k] ?? "";
  const contact = contactFields(kind, anonymous);
  const msgLen = v("message").length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setBanner(null);
    setErrors({});
    start(async () => {
      const r = await submitCommunityRequest(buildPayload(kind, values, anonymous, hp, startedAt.current ?? 0));
      if (r.ok) {
        track("community_form_submit", { kind });
        setDone(true);
        return;
      }
      const fe = r.error.fieldErrors ?? {};
      if (r.error.code === "invalid_input" && Object.keys(fe).length > 0) {
        const mapped = Object.fromEntries(Object.entries(fe).map(([k, m]) => [errorKey(k), m]));
        setErrors(mapped);
        const first = firstInvalid(ORDER[kind], mapped);
        if (first) requestAnimationFrame(() => document.getElementById(fid(first))?.focus());
        setBanner("Some fields need attention.");
      } else {
        setBanner(r.error.message);
      }
    });
  }

  function reset() {
    setValues({});
    setAnonymous(false);
    setHp("");
    setErrors({});
    setBanner(null);
    startedAt.current = Date.now();
    setDone(false);
  }

  if (done) {
    return (
      <div role="status" aria-live="polite" className="box p-6 shadow-hard">
        <p className="flex items-center gap-2 text-xl font-semibold">
          <CheckCircle2 size={22} strokeWidth={2} aria-hidden /> Got it.
        </p>
        <p className="mt-3 max-w-prose">
          We&apos;ll read this soon. We don&apos;t send email yet, so keep an eye on your usual channels.
        </p>
        <button type="button" className="btn btn-secondary mt-5" onClick={reset}>Send another</button>
      </div>
    );
  }

  const text = (k: string, label: string, opts: { required?: boolean; type?: string; inputMode?: "numeric" | "tel" | "email" | "url"; hint?: string; autoComplete?: string; max?: number } = {}) => (
    <Field id={fid(k)} label={label} required={opts.required} error={errors[k]} hint={opts.hint}>
      <input
        id={fid(k)}
        name={k}
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        autoComplete={opts.autoComplete}
        maxLength={opts.max}
        required={opts.required}
        className={inputCls}
        value={v(k)}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={fieldDescribedBy(fid(k), { error: errors[k], hint: opts.hint })}
      />
    </Field>
  );
  const select = (k: string, label: string, options: [string, string][]) => (
    <Field id={fid(k)} label={label} required error={errors[k]}>
      <select
        id={fid(k)}
        name={k}
        required
        className={inputCls}
        value={v(k)}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={fieldDescribedBy(fid(k), { error: errors[k] })}
      >
        <option value="">Choose one</option>
        {options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
      </select>
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate aria-busy={pending} className="box grid gap-5 p-5 shadow-hard md:p-7">
      {banner && (
        <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">{banner}</p>
      )}

      {kind === "feedback" && (
        <>
          {select("category", "What is this about?", [["suggestion", "A suggestion"], ["complaint", "A complaint"], ["other", "Something else"]])}
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-6 w-6 shrink-0 accent-[var(--field)]"
              checked={anonymous}
              onChange={(e) => {
                setAnonymous(e.target.checked);
                if (e.target.checked) setValues((p) => ({ ...p, name: "", email: "", phone: "", organisation: "" }));
              }}
            />
            <span>
              <span className="font-semibold">Send anonymously</span>
              <span className="block text-sm text-ink-3">We won&apos;t store your name, email, phone or account, so we can&apos;t reply to you.</span>
            </span>
          </label>
        </>
      )}

      {contact.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {text("name", "Your name", { required: true, autoComplete: "name", max: 80 })}
          {text("email", "Email", { required: true, type: "email", inputMode: "email", autoComplete: "email", max: 254 })}
          {text("phone", "Phone (optional)", { type: "tel", inputMode: "tel", autoComplete: "tel", max: 20 })}
          {text("organisation", "Organisation (optional)", { autoComplete: "organization", max: 120 })}
        </div>
      )}

      {kind === "host_event" && (
        <div className="grid gap-5 md:grid-cols-2">
          {text("event_title", "Event title", { required: true, max: 120 })}
          {text("expected_attendees", "Expected attendees (optional)", { type: "number", inputMode: "numeric" })}
          {text("preferred_date", "Preferred date (optional)", { type: "date" })}
          {text("venue", "Venue (optional)", { max: 120 })}
          {text("website", "Website (optional)", { type: "url", inputMode: "url", hint: "Start with https://", max: 300 })}
        </div>
      )}
      {kind === "partner" && (
        <div className="grid gap-5 md:grid-cols-2">
          {select("partnership_type", "Partnership type", [["sponsor", "Sponsor"], ["venue", "Venue"], ["media", "Media"], ["community", "Community"], ["other", "Other"]])}
          {text("website", "Website (optional)", { type: "url", inputMode: "url", hint: "Start with https://", max: 300 })}
        </div>
      )}

      {text("subject", "Subject", { required: true, max: 120 })}
      <Field id={fid("message")} label="Message" required error={errors.message} hint="Plain text only — < and > aren't allowed.">
        <textarea
          id={fid("message")}
          name="message"
          required
          maxLength={MSG_MAX}
          className={textareaCls}
          value={v("message")}
          onChange={(e) => set("message", e.target.value)}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={fieldDescribedBy(fid("message"), { error: errors.message, hint: "x" })}
        />
        <p className="mt-1.5 text-xs text-ink-3" aria-live="off">{msgLen}/{MSG_MAX}</p>
      </Field>

      {/* Honeypot: off-screen (never display:none, which some bots skip), out of the tab order and hidden from
          assistive tech. Humans never see or fill it; a filled value is treated as a bot. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor={fid("company_url")}>Leave this empty</label>
        <input id={fid("company_url")} name="company_url" type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
      </div>

      <div>
        <button type="submit" className="btn btn-primary min-h-12" disabled={pending} aria-busy={pending}>
          {pending ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Send size={18} strokeWidth={2} aria-hidden />}
          {pending ? "Sending" : "Send"}
        </button>
      </div>
    </form>
  );
}
