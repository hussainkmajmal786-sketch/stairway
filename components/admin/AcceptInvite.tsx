"use client";

import { useState, useTransition } from "react";
import { acceptInviteAction } from "@/lib/admin/people-actions";

/** One button, one POST (no GET side effects). Success redirects to /admin from the server action. */
export function AcceptInvite({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-4">
      {error && <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">{error}</p>}
      <div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await acceptInviteAction(token);
              if (r && !r.ok) setError(r.error.message);
            })
          }
        >
          {pending ? "Accepting…" : "Accept invite"}
        </button>
      </div>
    </div>
  );
}
