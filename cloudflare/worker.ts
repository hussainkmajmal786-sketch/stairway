// Custom Worker entry (OpenNext "custom worker" pattern). `opennextjs-cloudflare build` generates .open-next/worker.js
// (default export { fetch } plus Durable Object classes); this file re-uses its fetch handler unchanged and adds the
// Cron Trigger. Wrangler bundles it (wrangler.jsonc "main"). Excluded from tsc/eslint: .open-next exists only after
// a build. scheduled() returns at once unless a feature flag and CRON_SECRET are set, so idle ticks cost ~0 CPU.
// @ts-ignore generated at build time (tsc sees it only after a build, via cloudflare-env.d.ts)
import handler from "../.open-next/worker.js";
import { cronEnabled, cronRequest, type CronEnv } from "../lib/cron/request";

// @ts-ignore generated at build time (tsc sees it only after a build, via cloudflare-env.d.ts)
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch: (request: Request, env: unknown, ctx: Ctx) => handler.fetch(request, env, ctx),
  async scheduled(_controller: unknown, env: CronEnv, ctx: Ctx) {
    if (!cronEnabled(env)) return;
    ctx.waitUntil(
      handler.fetch(cronRequest(env), env, ctx).then((res: Response) => {
        if (!res.ok) console.error("cron tick failed:", res.status);
      }).catch(() => {
        // Short non-secret marker only: never log the error object (it could carry request details).
        console.error("cron tick threw");
      }),
    );
  },
};
