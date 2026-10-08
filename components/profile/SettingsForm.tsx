"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { PrivateSchema, fieldErrors } from "@/lib/profile/schema";
import { Field, fieldDescribedBy, inputCls } from "@/components/ui/Field";
import { cn } from "@/lib/utils";

const HINTS = {
  email: "From your Google account.",
  phone: "Only you and event organisers can see this.",
  ieeeMemberId: "Optional. Members get free entry and priority seats.",
};

export function SettingsForm({
  userId, email, initial,
}: {
  userId: string; email: string; initial: { phone: string; ieeeMemberId: string };
}) {
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = PrivateSchema.safeParse(d);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setStatus(null);
      return;
    }
    setErrors({});
    setBusy(true);
    setStatus(null);
    try {
      const { data, error } = await createClient()
        .from("profile_private")
        .update({ phone: parsed.data.phone, ieee_member_id: parsed.data.ieeeMemberId })
        .eq("user_id", userId)
        .select("user_id");
      // RLS makes a blocked update look like "0 rows", so treat that as a failure too.
      const ok = !error && (data?.length ?? 0) > 0;
      if (ok) setD({ phone: parsed.data.phone, ieeeMemberId: parsed.data.ieeeMemberId });
      setStatus(ok ? { ok: true, text: "Saved." } : { ok: false, text: "Couldn't save. Please try again." });
    } catch {
      setStatus({ ok: false, text: "Couldn't save. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 md:grid-cols-2">
      <Field id="email" label="Email" hint={HINTS.email} className="md:col-span-2">
        <input id="email" className={cn(inputCls, "bg-paper-2")} value={email} readOnly aria-readonly aria-describedby={fieldDescribedBy("email", { hint: HINTS.email })} />
      </Field>
      <Field id="phone" label="Phone (WhatsApp)" error={errors.phone} hint={HINTS.phone}>
        <input
          id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210"
          className={inputCls} value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })}
          aria-invalid={!!errors.phone} aria-describedby={fieldDescribedBy("phone", { error: errors.phone, hint: HINTS.phone })}
        />
      </Field>
      <Field id="ieeeMemberId" label="IEEE membership ID" error={errors.ieeeMemberId} hint={HINTS.ieeeMemberId}>
        <input
          id="ieeeMemberId" inputMode="numeric" autoComplete="off"
          className={inputCls} value={d.ieeeMemberId} onChange={(e) => setD({ ...d, ieeeMemberId: e.target.value })}
          aria-invalid={!!errors.ieeeMemberId} aria-describedby={fieldDescribedBy("ieeeMemberId", { error: errors.ieeeMemberId, hint: HINTS.ieeeMemberId })}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-4 md:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Save settings
        </button>
        <p role="status" aria-live="polite" className={cn("text-sm font-semibold", status?.ok ? "text-green-ink" : "text-red-ink")}>
          {status?.text}
        </p>
      </div>
    </form>
  );
}
