// Shared by the Next route and the custom worker entry (cloudflare/worker.ts), so it imports nothing.

export const CRON_PATH = "/api/cron/tick";

export interface CronEnv {
  CRON_SECRET?: string;
  PAYMENTS_ENABLED?: string;
  FUND_EASY_SYNC_ENABLED?: string;
}

/** Checked in scheduled() before Next is touched, so an idle tick costs almost no CPU. */
export function cronEnabled(env: CronEnv): boolean {
  const secretOk = typeof env.CRON_SECRET === "string" && env.CRON_SECRET.trim().length >= 32;
  return secretOk && (env.PAYMENTS_ENABLED === "true" || env.FUND_EASY_SYNC_ENABLED === "true");
}

/** In-process request to the tick route (handled by the same Worker; the host is never resolved). */
export function cronRequest(env: CronEnv, origin = "https://stairway.internal"): Request {
  return new Request(new URL(CRON_PATH, origin), {
    method: "POST",
    headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}`, "x-stairway-cron": "1" },
  });
}
