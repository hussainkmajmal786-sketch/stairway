"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpFromLine } from "lucide-react";
import { promoteWaitlistAction } from "@/lib/admin/registration-actions";

/** Promotes waitlisted people into free seats (oldest first, decided by the database). */
export function PromoteWaitlist({ eventId, freeSeats, waitlisted }: { eventId: string; freeSeats: number; waitlisted: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const blocked = waitlisted === 0 || freeSeats <= 0;
  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={pending || blocked}
        aria-describedby="promote-help"
        onClick={() => {
          setNote("");
          setError("");
          start(async () => {
            const r = await promoteWaitlistAction({ eventId });
            if (!r.ok) {
              setError(r.error.message);
              return;
            }
            setNote(`${r.data.promoted} ${r.data.promoted === 1 ? "person" : "people"} promoted.`);
            router.refresh();
          });
        }}
      >
        <ArrowUpFromLine size={16} aria-hidden /> Promote from waitlist
      </button>
      <p id="promote-help" className="mt-1 text-sm text-ink-3">
        {waitlisted === 0
          ? "Nobody is on the waitlist."
          : freeSeats <= 0
            ? "No free seats. Raise the capacity in the editor first."
            : `${freeSeats} free ${freeSeats === 1 ? "seat" : "seats"}, ${waitlisted} waiting.`}
      </p>
      <p aria-live="polite" className="min-h-5 text-sm font-semibold">
        {note}
      </p>
      {error && (
        <p role="alert" className="border-2 border-red-ink bg-error-bg p-2 text-sm font-semibold text-red-ink">
          {error}
        </p>
      )}
    </div>
  );
}
