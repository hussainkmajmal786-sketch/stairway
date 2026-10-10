import { runTick } from "@/lib/cron/tick";
import { cronSecret, paymentsConfig, syncConfig } from "@/lib/payments/config";
import { timingSafeEqualHex } from "@/lib/payments/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Called every 5 minutes by the Worker's scheduled() handler (cloudflare/worker.ts) with the CRON_SECRET bearer token;
// can also be called manually (curl) for a one-off run. Responds with counts only.

export async function POST(request: Request): Promise<Response> {
  const secret = cronSecret();
  if (!secret) return new Response(null, { status: 404 });
  const auth = request.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!timingSafeEqualHex(given, secret)) return Response.json({ ok: false }, { status: 401 });

  const pay = paymentsConfig();
  const sync = syncConfig();
  const serviceRoleKey = pay.enabled ? pay.serviceRoleKey : sync.enabled ? sync.serviceRoleKey : null;
  if (!serviceRoleKey) return Response.json({ ok: true, skipped: true });

  const report = await runTick({
    payments: pay.enabled,
    sync: sync.enabled ? { url: sync.url, secret: sync.secret } : null,
    db: () => createAdminClient(serviceRoleKey),
    fetch: (url, init) => fetch(url, init),
  });
  return Response.json({ ok: report.errors.length === 0, ...report }, { status: report.errors.length ? 500 : 200 });
}
