"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cancelRegistration } from "@/lib/registration/actions";
import { registrationError, type RegistrationError } from "@/lib/registration/errors";
import { ErrorPanel } from "@/components/registration/ErrorPanel";

type Phase = "idle" | "confirming" | "busy" | "done";

/**
 * True only for Next's redirect error (a successful cancel redirects from the server; the router still navigates).
 * notFound / forbidden / bailout errors are not a successful cancel, so they don't count.
 */
function isNavigation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "digest" in e && String(e.digest).startsWith("NEXT_REDIRECT");
}

/**
 * Two-step cancel. Free seats and waitlist places are cancelled; a payment hold is released; a paid seat becomes
 * refund_needed (refunded by the organisers). On success the server action redirects to My tickets (a fixed path), so
 * the cancelled ticket route is never re-rendered into a 404. Focus moves to "Yes" on open, back to the opener on
 * "Keep", stays on "Yes" while working (aria-disabled, not disabled, so focus isn't dropped), goes to the error
 * panel on failure and to the status line on success. `blocked` is the reason the server would refuse (checked in,
 * started, paid, pending payment): the button is then aria-disabled (still focusable) and described by the reason.
 */
export function CancelRegistration({
  registrationId, waitlisted, hold = false, paidAmount, blocked, here,
}: {
  registrationId: string;
  waitlisted: boolean;
  /** A pending_payment seat hold. */
  hold?: boolean;
  /** Formatted amount of a paid confirmed seat (cancelling makes it refund_needed). */
  paidAmount?: string;
  blocked: string | null;
  /** This ticket's path, so "Sign in" after an expired session comes back here. */
  here: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [restoreFocus, setRestoreFocus] = useState(false);
  const [error, setError] = useState<RegistrationError | null>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  // Focus "Yes" only when the question opens, not when a failed attempt returns to it (the error panel takes focus).
  const justOpened = useRef(false);
  const reasonId = useId();
  const questionId = useId();
  const label = waitlisted ? "Leave the waitlist" : hold ? "Release my held seat" : "Cancel registration";

  useEffect(() => {
    if (phase === "confirming" && justOpened.current) {
      justOpened.current = false;
      yesRef.current?.focus();
    } else if (phase === "done") doneRef.current?.focus();
    else if (phase === "idle" && restoreFocus) openRef.current?.focus();
  }, [phase, restoreFocus]);

  async function cancel() {
    if (phase === "busy" || phase === "done") return;
    setPhase("busy");
    setError(null);
    try {
      const res = await cancelRegistration(registrationId);
      // Only failures come back; success redirects (the promise rejects with Next's redirect error).
      setError(res?.error ?? registrationError("unknown"));
    } catch (e) {
      if (isNavigation(e)) {
        setPhase("done");
        return;
      }
      setError(registrationError("network"));
    }
    setPhase("confirming");
  }

  if (blocked) {
    return (
      <div className="grid gap-2">
        <button
          type="button"
          className="btn btn-sm btn-secondary justify-self-start"
          aria-disabled="true"
          aria-describedby={reasonId}
        >
          <X size={16} strokeWidth={2} aria-hidden /> {label}
        </button>
        <p id={reasonId} className="text-sm text-ink-2">{blocked}</p>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <p ref={doneRef} tabIndex={-1} role="status" className="font-semibold outline-none">
        {waitlisted ? "You've left the waitlist." : "Your registration is cancelled."} Taking you to My tickets…
      </p>
    );
  }

  if (phase === "idle") {
    return (
      <button
        ref={openRef}
        type="button"
        className="btn btn-sm btn-secondary justify-self-start"
        onClick={() => {
          setError(null);
          justOpened.current = true;
          setPhase("confirming");
        }}
      >
        <X size={16} strokeWidth={2} aria-hidden /> {label}
      </button>
    );
  }

  const busy = phase === "busy";
  return (
    <div className="box-2 grid gap-3 p-4" role="group" aria-labelledby={questionId}>
      <p id={questionId} className="font-semibold">
        {waitlisted
          ? "Leave the waitlist? You'll lose your place."
          : hold
            ? "Release your held seat? You can register again while seats remain."
            : paidAmount
              ? `Cancel your paid seat? It goes to the next person, and the organisers will refund ${paidAmount} to your original payment method (not automatic; it can take a few days).`
              : "Cancel your registration? Your seat goes to the next person on the waitlist, and you may not get it back."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          ref={yesRef}
          type="button"
          className="btn btn-sm btn-ink"
          onClick={cancel}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
        >
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {waitlisted ? "Yes, leave the waitlist" : "Yes, cancel"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={busy}
          onClick={() => {
            setError(null);
            setPhase("idle");
            setRestoreFocus(true);
          }}
        >
          {waitlisted ? "Keep my place" : "Keep my seat"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{busy ? "Cancelling…" : ""}</p>
      {error && (
        <ErrorPanel
          error={error}
          here={here}
          fallbackUrl={null}
          onRetry={() => {
            // The panel unmounts on retry: park focus on "Yes" first so it isn't dropped to <body>.
            yesRef.current?.focus();
            void cancel();
          }}
        />
      )}
    </div>
  );
}
