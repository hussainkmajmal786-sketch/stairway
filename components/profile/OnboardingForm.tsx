"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { OnboardingSchema, fieldErrors } from "@/lib/profile/schema";
import { BRANCHES, YEARS } from "@/lib/profile/options";
import { Field, fieldDescribedBy, inputCls } from "@/components/ui/Field";
import { AvatarUploader } from "./AvatarUploader";

export interface OnboardingInitial {
  fullName: string; handle: string; college: string; branch: string; year: string; avatarUrl: string | null;
}

const HANDLE_HINT = "Your profile lives at /u/your-handle.";

export function OnboardingForm({ userId, initial, next }: { userId: string; initial: OnboardingInitial; next: string }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof OnboardingInitial, v: string | null) => setD((x) => ({ ...x, [k]: v }));
  const aria = (k: string, hint?: string) => ({
    "aria-required": true,
    "aria-invalid": !!errors[k],
    "aria-describedby": fieldDescribedBy(k, { error: errors[k], hint }),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = OnboardingSchema.safeParse(d);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      document.getElementById(Object.keys(errs)[0])?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    setFormError(null);
    const v = parsed.data;
    const { data, error } = await createClient()
      .from("profiles")
      .update({
        full_name: v.fullName, handle: v.handle, college: v.college, branch: v.branch, year: v.year,
        avatar_url: d.avatarUrl, onboarded: true,
      })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (error) {
      if (error.code === "23505") {
        setErrors({ handle: "That handle is taken — try another." });
        document.getElementById("handle")?.focus();
      } else setFormError("We couldn't save your profile. Please try again.");
      return;
    }
    // No row back means the update matched nothing (e.g. RLS or a missing profile): don't pretend it saved.
    if (!data) return setFormError("We couldn't save your profile. Please try again.");
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="box mx-auto grid max-w-2xl gap-6 p-6 shadow-[6px_6px_0_0_var(--ink)] md:grid-cols-2 md:p-10">
      <div className="md:col-span-2">
        <AvatarUploader userId={userId} currentUrl={d.avatarUrl} name={d.fullName} onUploaded={(u) => set("avatarUrl", u)} />
      </div>
      <p className="text-sm text-ink-3 md:col-span-2">
        Fields marked <span className="text-red-ink">*</span> are required. You can add more details later from your dashboard.
      </p>
      <Field id="fullName" label="Full name" required error={errors.fullName} className="md:col-span-2">
        <input id="fullName" className={inputCls} autoComplete="name" value={d.fullName} onChange={(e) => set("fullName", e.target.value)} {...aria("fullName")} />
      </Field>
      <Field id="handle" label="Handle" required error={errors.handle} hint={HANDLE_HINT} className="md:col-span-2">
        <input
          id="handle" className={inputCls} autoComplete="username" autoCapitalize="none" spellCheck={false}
          value={d.handle} onChange={(e) => set("handle", e.target.value.toLowerCase())} {...aria("handle", HANDLE_HINT)}
        />
      </Field>
      <Field id="college" label="College" required error={errors.college} className="md:col-span-2">
        <input
          id="college" className={inputCls} autoComplete="organization" placeholder="College of Engineering Kidangoor"
          value={d.college} onChange={(e) => set("college", e.target.value)} {...aria("college")}
        />
      </Field>
      <Field id="branch" label="Branch" required error={errors.branch}>
        <select id="branch" className={inputCls} value={d.branch} onChange={(e) => set("branch", e.target.value)} {...aria("branch")}>
          <option value="">Select branch</option>
          {BRANCHES.map((b) => <option key={b}>{b}</option>)}
        </select>
      </Field>
      <Field id="year" label="Year" required error={errors.year}>
        <select id="year" className={inputCls} value={d.year} onChange={(e) => set("year", e.target.value)} {...aria("year")}>
          <option value="">Select year</option>
          {YEARS.map((y) => <option key={y}>{y}</option>)}
        </select>
      </Field>
      <div className="md:col-span-2">
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ArrowRight size={18} strokeWidth={2} aria-hidden />} Finish setup
        </button>
        <p role="alert" className="mt-3 text-sm font-semibold text-red-ink">{formError}</p>
      </div>
    </form>
  );
}
