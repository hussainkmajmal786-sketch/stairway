"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Field, fieldDescribedBy, inputCls } from "@/components/ui/Field";
import { createClient } from "@/lib/supabase/browser";
import { MemberNumberSchema, claimErrorCopy } from "@/lib/community/membership";
import { MEMBER_NUMBER_HINT, normalizeMemberNumber } from "@/lib/community/member-number";
import { createProofUpload, submitClaim } from "@/lib/community/membership-actions";
import { requestPrescreen } from "@/lib/community/prescreen-action";
import { cn } from "@/lib/utils";
import { ProofPicker } from "./ProofPicker";
import { PENDING_COPY } from "@/lib/community/membership";

type Step = "number" | "proof";

/**
 * Step 1: member number only. The server answers `proof_required` for EVERY non-verified outcome, so the copy never
 * says whether a number is on a roster. Step 2 uploads the card to the private bucket through a server-issued signed
 * upload URL (the server picks the path), then submits the claim with that path.
 */
export function ClaimForm({ renew = false, initialNumber = "" }: { renew?: boolean; initialNumber?: string }) {
  const router = useRouter();
  const [number, setNumber] = useState(initialNumber);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("number");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [numberError, setNumberError] = useState<string | undefined>();
  const [done, setDone] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const n = MemberNumberSchema.safeParse(number);
    if (!n.success) {
      setNumberError(claimErrorCopy("invalid_number"));
      return;
    }
    if (step === "proof" && !file) {
      setError("Choose an image of your card first.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setNumberError(undefined);
    try {
      let proofPath: string | null = null;
      if (file) {
        const issued = await createProofUpload({ type: file.type });
        if (!issued.ok) {
          setError(claimErrorCopy(issued.error.code === "invalid_input" ? "invalid_proof" : "unavailable"));
          return;
        }
        const up = await createClient().storage.from("ieee-proof").uploadToSignedUrl(issued.data.path, issued.data.token, file, {
          contentType: file.type,
        });
        if (up.error) {
          setError(claimErrorCopy("invalid_proof"));
          return;
        }
        proofPath = issued.data.path;
      }
      const r = await submitClaim({ memberNumber: n.data, proofPath });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      const s = r.data.status;
      if (s === "proof_required") {
        setStep("proof");
        setError(claimErrorCopy("proof_required"));
      } else if (s === "rate_limited") {
        setError(claimErrorCopy("rate_limited"));
      } else {
        setDone(s === "verified" ? "You are verified. Your badge is now showing." : PENDING_COPY);
        if (s === "pending_review" && r.data.claimId) void requestPrescreen(r.data.claimId).catch(() => undefined);
        router.refresh();
      }
    } catch {
      setError(claimErrorCopy("unavailable"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const numberHint = MEMBER_NUMBER_HINT;
  return (
    <form onSubmit={submit} noValidate className="grid gap-5" aria-label={renew ? "Renew IEEE membership" : "Verify IEEE membership"}>
      <Field id="claim-number" label="IEEE member number" error={numberError} hint={numberHint} required>
        <input
          id="claim-number" inputMode="numeric" autoComplete="off" maxLength={9} className={inputCls}
          value={number} disabled={busy || step === "proof"}
          onBlur={() => { const n = normalizeMemberNumber(number); if (n) setNumber(n); }} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
          aria-invalid={!!numberError} aria-describedby={fieldDescribedBy("claim-number", { error: numberError, hint: numberHint })}
        />
      </Field>
      {step === "number" && (
        <details className="border-2 border-ink bg-paper-2 p-3">
          <summary className="cursor-pointer font-semibold">Add a photo of your IEEE card (optional)</summary>
          <div className="mt-3 grid gap-3">
            <ProofPicker file={file} onChange={setFile} disabled={busy} />
            <p className="text-sm text-ink-2">Not needed in most cases: the officer checks your number in IEEE&apos;s own tool. Only you and the organisers can see it.</p>
          </div>
        </details>
      )}
      {step === "proof" && (
        <>
          <ProofPicker file={file} onChange={setFile} disabled={busy} />
          <p className="text-sm text-ink-2">
            Only you and the organisers can see this image. It is deleted within 90 days of a decision. Cover anything on the card
            that is not your name, member number and expiry.
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy || done !== null}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {step === "proof" ? "Upload and submit" : renew ? "Renew membership" : "Verify membership"}
        </button>
        {step === "proof" && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setStep("number"); setFile(null); setError(undefined); }}>
            Change number
          </button>
        )}
      </div>
      <p role="alert" className={cn("font-semibold text-red-ink", !error && "hidden")}>{error}</p>
      <p role="status" aria-live="polite" className={cn("font-semibold text-green-ink", !done && "hidden")}>{done}</p>
    </form>
  );
}
