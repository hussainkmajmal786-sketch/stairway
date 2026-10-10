"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server page every few seconds for a short while (payment confirming). Bounded, because each refresh
 * is a full server render on the Worker. The status shown always comes from the server.
 */
export function AutoRefresh({ intervalMs = 5000, maxMs = 45000 }: { intervalMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      if (Date.now() - start > maxMs) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, maxMs, router]);
  return (
    <p role="status" aria-live="polite" className="box-2 p-4 font-semibold">
      Confirming your payment with Razorpay… this page updates by itself. If it takes longer, My tickets shows the result.
    </p>
  );
}
