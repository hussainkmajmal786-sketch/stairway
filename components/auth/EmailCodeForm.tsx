"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Field, inputCls } from "@/components/ui/Field";

export function EmailCodeForm({ next }: { next: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("That email doesn't look right.");
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) return setError("We couldn't send a code. Please try again in a minute.");
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.verifyOtp({ email, token: code, type: "email" });
    if (err) {
      setBusy(false);
      return setError("That code didn't work. Check it and try again.");
    }
    // Full navigation (not router.push): /auth/continue is a route handler that redirects.
    window.location.assign(new URL(`/auth/continue?next=${encodeURIComponent(next)}`, window.location.origin).href);
  }

  return step === "email" ? (
    <form onSubmit={send} noValidate className="grid gap-4">
      <Field id="login-email" label="Email" error={error ?? undefined}>
        <input id="login-email" type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <button type="submit" className="btn btn-secondary w-full" disabled={busy}>
        {busy && <Loader2 size={16} className="animate-spin" />} Email me a code
      </button>
    </form>
  ) : (
    <form onSubmit={verify} noValidate className="grid gap-4">
      <Field id="login-code" label={`6-digit code sent to ${email}`} error={error ?? undefined}>
        <input id="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={inputCls} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy && <Loader2 size={16} className="animate-spin" />} Sign in
      </button>
    </form>
  );
}
