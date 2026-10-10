"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Field, fieldDescribedBy, inputCls } from "@/components/ui/Field";
import { BRANCHES, YEARS } from "@/lib/profile/options";
import { emptyAnswers, type AnswerValue, type Answers, type Question } from "@/lib/registration/questions";
import { registrationFieldErrors, registrationSchema, type Registrant } from "@/lib/registration/schema";
import { registrationError, type RegistrationError } from "@/lib/registration/errors";
import { registerForEvent, type RegisterResult } from "@/lib/registration/actions";
import { formatInr } from "@/lib/payments/money";
import { afterRegister } from "@/lib/payments/flow";
import { usePayFlow } from "@/components/payments/usePayFlow";
import { ticketPath } from "@/lib/registration/cta";
import { FORM_ERROR_ID, fieldOrder, firstInvalid, formLevelError, submitGate } from "@/lib/registration/form";
import { QuestionField } from "./QuestionField";
import { ErrorPanel } from "./ErrorPanel";

const HINTS: Partial<Record<string, string>> = { phone: "Only you and the organisers can see this.", ieeeMemberId: "Optional." };

export function RegistrationForm({
  slug, questions, initial, waitlist, fallbackUrl, paid,
}: {
  slug: string; questions: Question[]; initial: Registrant; waitlist: boolean; fallbackUrl: string | null;
  /** Set for a paid session while payments are on (the page decides from the server-side flag). */
  paid?: { pricePaise: number; step: number };
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const schema = useMemo(() => registrationSchema(questions), [questions]);
  const order = useMemo(() => fieldOrder(questions.map((q) => q.id)), [questions]);
  const [registrant, setRegistrant] = useState<Registrant>(initial);
  const [answers, setAnswers] = useState<Answers>(() => emptyAnswers(questions));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<RegistrationError | null>(null);
  const [busy, startTransition] = useTransition();
  // Paid sessions: after the hold is created, Checkout opens straight away. Closing it lands on the ticket page,
  // which shows "Complete payment" with the hold's countdown (the form itself cannot register twice).
  const abandonTo = useCallback((id: string) => `${ticketPath(id)}?new=1`, []);
  const { pay, error: payError } = usePayFlow({ step: paid?.step ?? 0, abandonTo });
  // The hold this form created, so "Try again" after a failed order retries the payment, not the registration.
  const [heldId, setHeldId] = useState<string | null>(null);

  const clientErrors = useMemo(() => {
    const r = schema.safeParse({ registrant, answers });
    return r.success ? {} : registrationFieldErrors(r.error);
  }, [schema, registrant, answers]);

  const errorFor = (id: string): string | undefined =>
    serverErrors[id] ?? (submitted || touched[id] ? clientErrors[id] : undefined);
  const blur = (id: string) => () => setTouched((t) => (t[id] ? t : { ...t, [id]: true }));
  const clearServer = (id: string) =>
    setServerErrors((e) => {
      if (!(id in e)) return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  const setField = (k: keyof Registrant, v: string) => {
    setRegistrant((r) => ({ ...r, [k]: v }));
    clearServer(k);
  };
  const setAnswer = (qid: string, v: AnswerValue) => {
    setAnswers((a) => ({ ...a, [qid]: v }));
    clearServer(`q-${qid}`);
  };
  const aria = (id: string, required = true) => ({
    "aria-required": required,
    "aria-invalid": !!errorFor(id),
    "aria-describedby": fieldDescribedBy(id, { error: errorFor(id), hint: HINTS[id] }),
  });
  const focusId = (id: string | null) => {
    if (id) document.getElementById(id)?.focus();
  };

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setSubmitted(true);
    const gate = submitGate(clientErrors, order);
    if (!gate.submit) {
      // Focus moves to the field, so the error panel (if any) can go.
      setError(null);
      focusId(gate.focusId);
      return;
    }
    // The previous error panel stays mounted while busy (its "Try again" button may hold focus);
    // it is replaced by the next error, or left behind by the navigation on success.
    startTransition(async () => {
      let res: RegisterResult;
      try {
        res = await registerForEvent(slug, { registrant, answers });
      } catch {
        setError(registrationError("network"));
        return;
      }
      if (res.ok) {
        const step = afterRegister(res);
        if (step.kind === "pay") {
          // A paid hold goes to Checkout, never to the "You're in" copy. Inside the transition, so the button stays
          // busy while Checkout opens and the payment is verified.
          setHeldId(step.registrationId);
          setError(null);
          await pay(step.registrationId);
          return;
        }
        // Inside the transition, so the button stays busy until the ticket page has loaded.
        router.push(step.href);
        return;
      }
      setError(res.error);
      if (res.fieldErrors) {
        setServerErrors(res.fieldErrors);
        focusId(firstInvalid(res.fieldErrors, order));
      }
    });
  }

  const shownError = payError ?? error;
  const invalidCount = Object.keys(clientErrors).length;
  const formError = formLevelError(serverErrors, order) ?? (submitted ? formLevelError(clientErrors, order) : undefined);

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="grid gap-10 lg:grid-cols-[1fr_340px]" aria-busy={busy}>
      <div className="grid gap-8">
        <section className="box grid gap-6 p-6 shadow-[6px_6px_0_0_var(--ink)] md:grid-cols-2 md:p-10" aria-labelledby="you-h">
          <div className="md:col-span-2">
            <h2 id="you-h" className="mono font-bold">Your details</h2>
            <p className="mt-2 text-sm text-ink-3">
              Filled in from your profile; changes are saved back to it. Fields marked <span className="text-red-ink">*</span> are required.
            </p>
          </div>
          <Field id="fullName" label="Full name" required error={errorFor("fullName")} className="md:col-span-2">
            <input id="fullName" className={inputCls} autoComplete="name" value={registrant.fullName}
              onChange={(e) => setField("fullName", e.target.value)} onBlur={blur("fullName")} {...aria("fullName")} />
          </Field>
          <Field id="college" label="College" required error={errorFor("college")} className="md:col-span-2">
            <input id="college" className={inputCls} autoComplete="organization" value={registrant.college}
              onChange={(e) => setField("college", e.target.value)} onBlur={blur("college")} {...aria("college")} />
          </Field>
          <Field id="branch" label="Branch" required error={errorFor("branch")}>
            <select id="branch" className={inputCls} value={registrant.branch}
              onChange={(e) => setField("branch", e.target.value)} onBlur={blur("branch")} {...aria("branch")}>
              <option value="">Select branch</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field id="year" label="Year" required error={errorFor("year")}>
            <select id="year" className={inputCls} value={registrant.year}
              onChange={(e) => setField("year", e.target.value)} onBlur={blur("year")} {...aria("year")}>
              <option value="">Select year</option>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </Field>
          <Field id="phone" label="Phone (WhatsApp)" required error={errorFor("phone")} hint={HINTS.phone}>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" className={inputCls}
              value={registrant.phone} onChange={(e) => setField("phone", e.target.value)} onBlur={blur("phone")} {...aria("phone")} />
          </Field>
          <Field id="ieeeMemberId" label="IEEE membership ID" error={errorFor("ieeeMemberId")} hint={HINTS.ieeeMemberId}>
            <input id="ieeeMemberId" inputMode="numeric" autoComplete="off" className={inputCls}
              value={registrant.ieeeMemberId} onChange={(e) => setField("ieeeMemberId", e.target.value)}
              onBlur={blur("ieeeMemberId")} {...aria("ieeeMemberId", false)} />
          </Field>
        </section>

        {questions.length > 0 && (
          <section className="box grid gap-6 p-6 shadow-[6px_6px_0_0_var(--ink)] md:p-10" aria-labelledby="questions-h">
            <h2 id="questions-h" className="mono font-bold">A few questions from the organisers</h2>
            {questions.map((q) => (
              <QuestionField
                key={q.id} q={q} value={answers[q.id]} error={errorFor(`q-${q.id}`)}
                onChange={(v) => setAnswer(q.id, v)} onBlur={blur(`q-${q.id}`)}
              />
            ))}
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <div className="border-2 border-ink bg-paper-2 p-6 shadow-[6px_6px_0_0_var(--ink)]">
          <p className="mono font-bold">
            {waitlist
              ? "Event is full — you'll join the waitlist"
              : paid
                ? `Paid registration · ${formatInr(paid.pricePaise)}`
                : "Free registration"}
          </p>
          <p className="mt-2 text-sm text-ink-2">
            {waitlist
              ? paid
                ? "No payment now. If a seat frees up you get 15 minutes to pay; My tickets shows your place."
                : "If a seat frees up you move up automatically; My tickets shows your place."
              : paid
                ? "Continuing holds your seat for 15 minutes while you pay securely with Razorpay (UPI, cards, netbanking)."
                : "Your ticket appears in My tickets straight after you confirm."}{" "}
            We don&apos;t send a confirmation email.
          </p>
          {formError && (
            <p id={FORM_ERROR_ID} tabIndex={-1} role="alert" className="mt-4 text-sm font-semibold text-red-ink outline-none focus-visible:outline-3">
              {formError}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg mt-6 w-full" disabled={busy}>
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ArrowRight size={18} strokeWidth={2} aria-hidden />}
            {busy
              ? paid && !waitlist ? "Opening payment…" : "Saving…"
              : waitlist
                ? "Join the waitlist"
                : paid
                  ? `Continue to payment · ${formatInr(paid.pricePaise)}`
                  : "Confirm registration"}
          </button>
          <p className="sr-only" role="status" aria-live="polite">
            {busy ? (waitlist ? "Joining the waitlist…" : "Registering…") : ""}
          </p>
          {submitted && !shownError && invalidCount > 0 && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-ink">
              {invalidCount === 1 ? "One field needs" : `${invalidCount} fields need`} a look before you can register.
            </p>
          )}
        </div>
        {shownError && (
          <ErrorPanel
            error={shownError} slug={slug} fallbackUrl={fallbackUrl}
            onRetry={() => {
              // After a failed order / Checkout the seat is already held: retry the payment, not the registration.
              if (payError && heldId) startTransition(() => pay(heldId));
              else formRef.current?.requestSubmit();
            }}
            onFixFields={() => focusId(firstInvalid({ ...clientErrors, ...serverErrors }, order))}
            autoFocus={shownError.recovery !== "fix_fields"}
          />
        )}
        <p className="px-2 text-xs text-ink-3">
          By registering you agree to the <Link href="/code-of-conduct" className="underline hover:bg-yellow">Code of Conduct</Link> and{" "}
          <Link href="/privacy" className="underline hover:bg-yellow">Privacy Policy</Link>. Once your seat is confirmed, your name,
          photo and headline appear in the session&apos;s attendee list, visible to signed-in members only.
        </p>
      </aside>
    </form>
  );
}
