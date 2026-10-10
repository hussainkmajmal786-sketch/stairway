import "server-only";

// Feature flags + secret presence. Everything money-related is OFF unless the flag is exactly "true" AND every
// secret it needs is present. Secrets are read from process.env (OpenNext copies Worker secrets into it per request)
// and are never logged, returned to the browser (except the public key id) or put in NEXT_PUBLIC_* variables.
// This is the only module that reads payment / sync / cron secrets. It never throws: a bad or missing value
// simply means "off".

export type Env = Record<string, string | undefined>;

export type PaymentsConfig =
  | { enabled: false }
  | { enabled: true; keyId: string; keySecret: string; webhookSecret: string; serviceRoleKey: string };

export type SyncConfig = { enabled: false } | { enabled: true; url: string; secret: string; serviceRoleKey: string };

const KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]{8,32}$/;
const val = (v: string | undefined, min = 8): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length >= min ? t : null;
};

export function readPaymentsConfig(env: Env): PaymentsConfig {
  if (env.PAYMENTS_ENABLED !== "true") return { enabled: false };
  const keyId = val(env.RAZORPAY_KEY_ID);
  const keySecret = val(env.RAZORPAY_KEY_SECRET);
  const webhookSecret = val(env.RAZORPAY_WEBHOOK_SECRET);
  const serviceRoleKey = val(env.SUPABASE_SERVICE_ROLE_KEY, 20);
  // The cron tick is what releases expired holds and promotes the waitlist: without it a paid seat would be held
  // forever, so payments stay off until CRON_SECRET is present.
  if (!readCronSecret(env)) return { enabled: false };
  if (!keyId || !KEY_ID.test(keyId) || !keySecret || !webhookSecret || !serviceRoleKey) return { enabled: false };
  return { enabled: true, keyId, keySecret, webhookSecret, serviceRoleKey };
}

export function readSyncConfig(env: Env): SyncConfig {
  if (env.FUND_EASY_SYNC_ENABLED !== "true") return { enabled: false };
  const raw = val(env.FUND_EASY_SYNC_URL);
  const secret = val(env.STAIRWAY_SYNC_SECRET, 32);
  const serviceRoleKey = val(env.SUPABASE_SERVICE_ROLE_KEY, 20);
  if (!raw || !secret || !serviceRoleKey) return { enabled: false };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { enabled: false };
  }
  if (url.protocol !== "https:") return { enabled: false };
  return { enabled: true, url: url.toString(), secret, serviceRoleKey };
}

export function readCronSecret(env: Env): string | null {
  return val(env.CRON_SECRET, 32);
}

// Read at call time (never cached at module level): Worker secrets are per request under OpenNext.
export const paymentsConfig = (): PaymentsConfig => readPaymentsConfig(process.env);
export const syncConfig = (): SyncConfig => readSyncConfig(process.env);
export const cronSecret = (): string | null => readCronSecret(process.env);
