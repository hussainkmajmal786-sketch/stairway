"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { GoogleG } from "@/components/ui/BrandIcons";
import { EMAIL_LOGIN_ENABLED } from "@/lib/auth/config";
import { EmailCodeForm } from "./EmailCodeForm";

export function LoginPanel({ next, error }: { next: string; error: string | null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error);

  async function google() {
    setBusy(true);
    setMessage(null);
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) {
      setMessage("Couldn't start Google sign-in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="box mx-auto max-w-md p-6 shadow-[6px_6px_0_0_var(--ink)] md:p-8">
      <button type="button" onClick={google} disabled={busy} className="btn btn-primary btn-lg w-full">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <GoogleG size={20} />}
        Continue with Google
      </button>
      {EMAIL_LOGIN_ENABLED && (
        <>
          <p className="mono my-5 text-center font-bold text-ink-3">or</p>
          <EmailCodeForm next={next} />
        </>
      )}
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm font-semibold text-red-ink">
        {message}
      </p>
      <p className="mt-2 text-xs text-ink-3">
        By signing in you agree to the <a className="underline" href="/code-of-conduct">Code of Conduct</a> and{" "}
        <a className="underline" href="/privacy">Privacy Policy</a>.
      </p>
    </div>
  );
}
