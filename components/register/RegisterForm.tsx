"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, CalendarPlus, Check, Loader2 } from "lucide-react";
import { useClock } from "@/components/providers/ClockProvider";
import { Whatsapp } from "@/components/ui/BrandIcons";
import { event } from "@/data/event";
import { pad2, shortDate } from "@/lib/weekends";
import { googleCalendarUrl } from "@/lib/calendar";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface Data {
  name: string;
  email: string;
  phone: string;
  college: string;
  branch: string;
  year: string;
  ieee: "yes" | "no" | "";
  ieeeId: string;
  weekends: string[];
  level: string;
  source: string;
}

const BRANCHES = ["Computer Science", "Electronics & Communication", "Electrical & Electronics", "Information Technology", "Mechanical", "Civil", "Other"];
const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "Postgraduate", "Faculty / Alumni"];
const LEVELS = ["Complete beginner", "Know some Python", "Built an ML model", "Comfortable with deep learning"];
const SOURCES = ["Instagram", "WhatsApp", "LinkedIn", "Friend", "Poster on campus", "Faculty", "Other"];

function validate(d: Data) {
  const e: Partial<Record<keyof Data, string>> = {};
  if (d.name.trim().length < 2) e.name = "Tell us your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = "That email doesn't look right.";
  if (!/^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/.test(d.phone.trim())) e.phone = "Use a 10-digit Indian mobile number.";
  if (d.college.trim().length < 3) e.college = "Which college are you from?";
  if (!d.branch) e.branch = "Pick your branch.";
  if (!d.year) e.year = "Pick your year.";
  if (!d.ieee) e.ieee = "Let us know if you're an IEEE member.";
  if (d.ieee === "yes" && !/^\d{8,9}$/.test(d.ieeeId.trim())) e.ieeeId = "IEEE membership IDs are 8–9 digits.";
  if (d.weekends.length === 0) e.weekends = "Choose at least one step.";
  if (!d.level) e.level = "Choose your experience level.";
  return e;
}

const inputCls = "h-12 w-full border-2 border-ink bg-paper px-4 outline-none placeholder:text-ink-4 focus:bg-paper-2 focus:shadow-[3px_3px_0_0_var(--ink)] aria-[invalid=true]:bg-red/15";

const Req = () => (
  <span className="ml-0.5 text-red-ink" aria-hidden>*</span>
);

function Field({ id, label, error, children, hint, required = true }: { id: string; label: string; error?: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="mono mb-2 block font-bold">
        {label}
        {required && <Req />}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-ink">
          <AlertCircle size={14} strokeWidth={2} aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

export function RegisterForm() {
  const params = useSearchParams();
  const { weekends, next } = useClock();
  const open = weekends.filter((w) => w.status !== "completed");
  const pre = params.get("step");
  const initialStep = open.find((w) => w.slug === pre)?.slug ?? next.slug;

  const [d, setD] = useState<Data>({
    name: "", email: "", phone: "", college: "", branch: "", year: "", ieee: "", ieeeId: "", weekends: [initialStep], level: "", source: "",
  });
  const [touched, setTouched] = useState<Partial<Record<keyof Data, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [demo, setDemo] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = useMemo(() => validate(d), [d]);
  const show = (k: keyof Data) => (submitted || touched[k]) && errors[k];
  const set = <K extends keyof Data>(k: K, v: Data[K]) => setD((x) => ({ ...x, [k]: v }));
  const blur = (k: keyof Data) => () => setTouched((t) => ({ ...t, [k]: true }));
  const aria = (k: keyof Data) => ({ "aria-required": true, "aria-invalid": !!show(k), "aria-describedby": show(k) ? `${k}-err` : undefined });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const firstKey = (Object.keys(errors) as (keyof Data)[])[0];
    if (firstKey) {
      // errors render on the next pass, so target the field directly
      const target =
        firstKey === "ieee"
          ? formRef.current?.querySelector<HTMLElement>("input[name='ieee']")
          : firstKey === "weekends"
            ? formRef.current?.querySelector<HTMLElement>("input[type='checkbox']")
            : document.getElementById(firstKey);
      target?.focus();
      return;
    }
    setState("sending");
    try {
      if (event.registration.endpoint) {
        const res = await fetch(event.registration.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ ...d, weekends: d.weekends.join(", "), submittedAt: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } else {
        setDemo(true);
        await new Promise((r) => setTimeout(r, 700));
      }
      track("registration_complete", { steps: d.weekends.join(",") });
      setState("done");
      scrollTo({ top: 0 });
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    const first = weekends.find((w) => w.slug === d.weekends[0])!;
    return (
      <div className="mx-auto max-w-2xl border-2 border-ink bg-paper p-8 text-center shadow-[6px_6px_0_0_var(--ink)] md:p-14" role="status">
        <span className="mx-auto grid h-20 w-20 animate-[pop_0.3s_var(--ease)] place-items-center border-2 border-ink bg-green shadow-[4px_4px_0_0_var(--ink)]">
          <Check size={36} strokeWidth={2} aria-hidden />
        </span>
        <h2 className="mt-8 text-3xl font-semibold md:text-4xl">You&apos;re on the stairway. See you this weekend.</h2>
        <p className="mt-4 text-ink-2">
          We&apos;ve saved your spot for {d.weekends.length === 1 ? "" : `${d.weekends.length} steps, starting with `}Step {pad2(first.step)}: {first.title} on {shortDate(first.start)}. A confirmation will reach {d.email}.
        </p>
        {demo && (
          <p className="mx-auto mt-4 max-w-md border-2 border-ink bg-yellow p-3 text-sm">
            Demo mode — no registration endpoint is connected yet, so nothing was sent. Set <code>registration.endpoint</code> in <code>data/event.ts</code>.
          </p>
        )}
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={googleCalendarUrl(first)} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            <CalendarPlus size={18} strokeWidth={2} /> Add to calendar
          </a>
          <a href={event.social.whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            <Whatsapp size={18} /> Join WhatsApp group
          </a>
        </div>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">← Back to the stairway</Link>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="grid gap-10 lg:grid-cols-[1fr_360px]">
      <div className="grid gap-6 border-2 border-ink bg-paper p-6 shadow-[6px_6px_0_0_var(--ink)] md:grid-cols-2 md:p-10">
        <p className="text-sm text-ink-3 md:col-span-2">
          Fields marked <span className="text-red-ink">*</span> are required.
        </p>
        <Field id="name" label="Full name" error={show("name") || undefined}>
          <input id="name" className={inputCls} autoComplete="name" value={d.name} onChange={(e) => set("name", e.target.value)} onBlur={blur("name")} {...aria("name")} />
        </Field>
        <Field id="email" label="Email" error={show("email") || undefined}>
          <input id="email" type="email" className={inputCls} autoComplete="email" value={d.email} onChange={(e) => set("email", e.target.value)} onBlur={blur("email")} {...aria("email")} />
        </Field>
        <Field id="phone" label="Phone (WhatsApp)" error={show("phone") || undefined}>
          <input id="phone" type="tel" inputMode="tel" className={inputCls} autoComplete="tel" placeholder="+91 98765 43210" value={d.phone} onChange={(e) => set("phone", e.target.value)} onBlur={blur("phone")} {...aria("phone")} />
        </Field>
        <Field id="college" label="College" error={show("college") || undefined}>
          <input id="college" className={inputCls} autoComplete="organization" placeholder="College of Engineering Kidangoor" value={d.college} onChange={(e) => set("college", e.target.value)} onBlur={blur("college")} {...aria("college")} />
        </Field>
        <Field id="branch" label="Branch" error={show("branch") || undefined}>
          <select id="branch" className={inputCls} value={d.branch} onChange={(e) => set("branch", e.target.value)} onBlur={blur("branch")} {...aria("branch")}>
            <option value="">Select branch</option>
            {BRANCHES.map((b) => <option key={b}>{b}</option>)}
          </select>
        </Field>
        <Field id="year" label="Year" error={show("year") || undefined}>
          <select id="year" className={inputCls} value={d.year} onChange={(e) => set("year", e.target.value)} onBlur={blur("year")} {...aria("year")}>
            <option value="">Select year</option>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
        </Field>

        <fieldset className="md:col-span-2" aria-describedby={show("ieee") ? "ieee-err" : undefined}>
          <legend className="mono mb-2 font-bold">IEEE member?<Req /></legend>
          <div className="flex gap-2">
            {(["yes", "no"] as const).map((v) => (
              <label key={v} className={cn("chip-btn inline-flex cursor-pointer items-center has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-blue-ink", d.ieee === v && "!bg-ink !text-paper")}>
                <input type="radio" name="ieee" value={v} checked={d.ieee === v} onChange={() => set("ieee", v)} className="sr-only" data-invalid={!!show("ieee")} />
                {v === "yes" ? "Yes" : "No"}
              </label>
            ))}
          </div>
          {show("ieee") && <p id="ieee-err" className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-ink"><AlertCircle size={14} strokeWidth={2} aria-hidden /> {errors.ieee}</p>}
        </fieldset>
        {d.ieee === "yes" && (
          <Field id="ieeeId" label="IEEE membership ID" error={show("ieeeId") || undefined} hint="Find it on your IEEE account page.">
            <input id="ieeeId" inputMode="numeric" className={inputCls} value={d.ieeeId} onChange={(e) => set("ieeeId", e.target.value)} onBlur={blur("ieeeId")} {...aria("ieeeId")} />
          </Field>
        )}

        <fieldset className="md:col-span-2" aria-describedby={show("weekends") ? "weekends-err" : undefined}>
          <legend className="mono mb-3 font-bold">Which steps are you joining?<Req /></legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {open.map((w) => {
              const on = d.weekends.includes(w.slug);
              const full = w.seatsLeft === 0;
              return (
                <label key={w.slug} className={cn("flex min-h-14 cursor-pointer items-center gap-3 border-2 border-ink px-4 py-3 transition-colors", on ? "bg-yellow" : "bg-paper hover:bg-paper-2", full && "opacity-60")}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => set("weekends", on ? d.weekends.filter((s) => s !== w.slug) : [...d.weekends, w.slug])}
                    className="h-5 w-5 accent-[#100f0d]"
                    aria-invalid={!!show("weekends")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs font-bold">Step {pad2(w.step)} · {shortDate(w.start)}</span>
                    <span className="block truncate text-sm">{w.title}{full && " — waitlist"}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {show("weekends") && <p id="weekends-err" className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-ink"><AlertCircle size={14} strokeWidth={2} aria-hidden /> {errors.weekends}</p>}
        </fieldset>

        <Field id="level" label="Experience level" error={show("level") || undefined}>
          <select id="level" className={inputCls} value={d.level} onChange={(e) => set("level", e.target.value)} onBlur={blur("level")} {...aria("level")}>
            <option value="">Select level</option>
            {LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
        <Field id="source" label="How did you hear about us? (optional)" required={false}>
          <select id="source" className={inputCls} value={d.source} onChange={(e) => set("source", e.target.value)}>
            <option value="">Select one</option>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <div className="border-2 border-ink bg-paper-2 p-6 shadow-[6px_6px_0_0_var(--ink)]">
          <p className="mono font-bold">Summary</p>
          <p className="mt-3 text-2xl font-semibold">{d.weekends.length} step{d.weekends.length === 1 ? "" : "s"} selected</p>
          <ul className="mt-3 space-y-1 text-sm text-ink-2">
            {weekends.filter((w) => d.weekends.includes(w.slug)).map((w) => <li key={w.slug}>Step {pad2(w.step)} · {w.title}</li>)}
          </ul>
          <button type="submit" className="btn btn-primary btn-lg mt-6 w-full" disabled={state === "sending"}>
            {state === "sending" ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} strokeWidth={2} />}
            {state === "sending" ? "Saving your step…" : "Claim your step"}
          </button>
          {state === "error" && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-ink">We couldn&apos;t save that. Check your connection and try again{event.registration.googleFormUrl ? <>, or use the <a className="underline" href={event.registration.googleFormUrl} target="_blank" rel="noopener noreferrer">Google Form</a></> : ""}.</p>
          )}
          {submitted && Object.keys(errors).length > 0 && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-ink">A few fields need a look before you can climb.</p>
          )}
        </div>
        <p className="px-2 text-xs text-ink-3">
          By registering you agree to the <Link href="/code-of-conduct" className="underline hover:bg-yellow">Code of Conduct</Link> and <Link href="/privacy" className="underline hover:bg-yellow">Privacy Policy</Link>.
        </p>
      </aside>
    </form>
  );
}
