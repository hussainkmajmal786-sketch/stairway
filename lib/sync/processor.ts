import { z } from "zod";
import { readCapped, type FetchLike } from "@/lib/payments/razorpay";
import type { AdminClient } from "@/lib/supabase/admin";
import { buildEnvelope, buildSyncRequest, classifyResponse, SYNC_EVENT_TYPES, type DeliveryOutcome } from "./contract";

// Drains the Fund Easy outbox: claim (≤ 10 rows, 2-minute lease) -> signed POST -> complete. Bounded by a wall-clock
// budget so a cron tick stays short; rows left over keep their lease and are claimed again after it lapses.
// Never blocks registration or payment: it only runs from the cron tick.

/** The receiver's answers are tiny JSON; we only read an error code out of them. */
const MAX_SYNC_RESPONSE_BYTES = 16 * 1024;

export interface ProcessReport {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  skipped: number;
}

const Batch = z.array(
  z.object({
    id: z.guid(),
    event_type: z.enum(SYNC_EVENT_TYPES),
    idempotency_key: z.string().min(1).max(200),
    payload: z.record(z.string(), z.unknown()),
    attempts: z.number().int(),
    created_at: z.string(),
  }),
);

export async function processOutbox(deps: {
  db: AdminClient;
  fetch: FetchLike;
  url: string;
  secret: string;
  now?: () => number;
  budgetMs?: number;
  limit?: number;
}): Promise<ProcessReport> {
  const now = deps.now ?? Date.now;
  const start = now();
  const budget = deps.budgetMs ?? 20_000;
  const report: ProcessReport = { claimed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 };

  const { data, error } = await deps.db.rpc("claim_sync_batch", { p_limit: deps.limit ?? 10 });
  if (error) throw new Error(`claim_sync_batch failed (${error.code ?? "no code"})`);
  const batch = Batch.safeParse(data);
  if (!batch.success) throw new Error("claim_sync_batch returned an unexpected shape");
  report.claimed = batch.data.length;

  for (const row of batch.data) {
    if (now() - start >= budget) {
      report.skipped++;
      continue;
    }
    let outcome: DeliveryOutcome;
    try {
      const init = await buildSyncRequest(deps.secret, buildEnvelope(row), now());
      const res = await deps.fetch(deps.url, init);
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        // Redirects are never followed (redirect: "manual"); a receiver that redirects is misconfigured: retry.
        await res.body?.cancel().catch(() => undefined);
        outcome = { ok: false, permanent: false, error: "redirect" };
      } else {
        const text = await readCapped(res, MAX_SYNC_RESPONSE_BYTES).catch(() => null);
        outcome = classifyResponse(res.status, text ?? "");
      }
    } catch (e) {
      outcome = { ok: false, permanent: false, error: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network" };
    }
    const { data: status, error: completeError } = await deps.db.rpc("complete_sync", {
      p_id: row.id,
      p_ok: outcome.ok,
      p_permanent: !outcome.ok && outcome.permanent,
      p_error: outcome.ok ? undefined : outcome.error,
    });
    if (completeError || status === "failed") report.failed++;
    else if (status === "sent") report.sent++;
    else if (status === "dead") report.dead++;
    else report.failed++;
  }
  return report;
}
