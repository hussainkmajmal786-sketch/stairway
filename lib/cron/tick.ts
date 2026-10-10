import { z } from "zod";
import type { FetchLike } from "@/lib/payments/razorpay";
import type { AdminClient } from "@/lib/supabase/admin";
import { processOutbox, type ProcessReport } from "@/lib/sync/processor";

// One cron tick: release expired holds + promote waitlists (payments on), then drain the Fund Easy outbox (sync on).
// Each step is isolated: a failure is reported (name/code only) and the next step still runs.

export interface TickReport {
  holds: { events: number; expired: number; promoted: number } | null;
  sync: ProcessReport | null;
  errors: string[];
}

const Holds = z.object({ events: z.number().int(), expired: z.number().int(), promoted: z.number().int() });

export async function runTick(deps: {
  payments: boolean;
  sync: { url: string; secret: string } | null;
  db: () => AdminClient;
  fetch: FetchLike;
  now?: () => number;
}): Promise<TickReport> {
  const report: TickReport = { holds: null, sync: null, errors: [] };
  if (!deps.payments && !deps.sync) return report;
  const db = deps.db();

  if (deps.payments) {
    const { data, error } = await db.rpc("expire_holds", { p_limit: 50 });
    const parsed = Holds.safeParse(data);
    if (error) report.errors.push(`expire_holds:${error.code ?? "error"}`);
    else if (!parsed.success) report.errors.push("expire_holds:shape");
    else report.holds = parsed.data;
  }

  if (deps.sync) {
    try {
      report.sync = await processOutbox({ db, fetch: deps.fetch, url: deps.sync.url, secret: deps.sync.secret, now: deps.now });
    } catch (e) {
      report.errors.push(`sync:${e instanceof Error ? e.name : "error"}`);
    }
  }
  return report;
}
