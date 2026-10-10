import { paymentsConfig } from "@/lib/payments/config";
import { readCapped } from "@/lib/payments/razorpay";
import { cleanEventId, errorCode, handleRazorpayWebhook, MAX_WEBHOOK_BYTES } from "@/lib/payments/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

// Razorpay webhook (configure: URL https://<host>/api/payments/webhook, events order.paid + refund.processed,
// secret = the webhook secret read by lib/payments/config.ts). Only POST is exported, so other methods get 405; no CORS headers are set
// (Razorpay calls server to server). The middleware matcher skips this path (no session refresh). Bodies are never
// logged. The body is read with a byte cap (a missing or false content-length cannot make it read more).

const json = (body: { ok: boolean; result: string }, status: number) => Response.json(body, { status });

export async function POST(request: Request): Promise<Response> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return new Response(null, { status: 404 });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) return json({ ok: false, result: "too_large" }, 413);
  let rawBody: string | null;
  try {
    rawBody = await readCapped(request, MAX_WEBHOOK_BYTES);
  } catch {
    return json({ ok: false, result: "bad_body" }, 400);
  }
  if (rawBody === null) return json({ ok: false, result: "too_large" }, 413);
  const eventId = request.headers.get("x-razorpay-event-id");
  try {
    const res = await handleRazorpayWebhook(
      {
        webhookSecret: cfg.webhookSecret,
        creds: { keyId: cfg.keyId, keySecret: cfg.keySecret },
        fetch: (url, init) => fetch(url, init),
        db: () => createAdminClient(cfg.serviceRoleKey),
      },
      { rawBody, signature: request.headers.get("x-razorpay-signature"), eventId },
    );
    return json(res.body, res.status);
  } catch (e) {
    // Event id + a short code only (never the message: it could carry ids). Razorpay retries on 5xx.
    console.error("razorpay webhook retry", JSON.stringify({ event: cleanEventId(eventId) ?? "none", code: errorCode(e) }));
    return json({ ok: false, result: "retry" }, 500);
  }
}
