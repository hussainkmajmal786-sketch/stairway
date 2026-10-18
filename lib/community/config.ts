// The ONLY file that names the community secrets (ANTHROPIC_API_KEY, COMMUNITY_HASH_SALT). Read at call time, never
// cached at module level: Worker secrets are per request under OpenNext. Never log or return these values.

type Env = Record<string, string | undefined>;

/** Documented default: a cheap, vision-capable Claude model (confirmed against the claude-api model table). */
export const DEFAULT_PRESCREEN_MODEL = "claude-haiku-5-5";

export type PrescreenConfig = { enabled: false } | { enabled: true; apiKey: string; model: string };

const MODEL_ID = /^[a-z0-9][a-z0-9.-]{2,63}$/;

/** Enabled only when the flag is exactly "true" AND the key looks real. Anything else: disabled, no network. */
export function prescreenConfig(env: Env = process.env): PrescreenConfig {
  if (env.IEEE_PRESCREEN_ENABLED !== "true") return { enabled: false };
  const apiKey = (env.ANTHROPIC_API_KEY ?? "").trim();
  if (apiKey.length < 20) return { enabled: false };
  const raw = (env.IEEE_PRESCREEN_MODEL ?? "").trim();
  return { enabled: true, apiKey, model: MODEL_ID.test(raw) ? raw : DEFAULT_PRESCREEN_MODEL };
}

/** Salt for IP hashing (>= 16 chars). Missing -> null (per-email limit and the global backstop still apply). */
export function formsHashSalt(env: Env = process.env): string | null {
  const v = (env.COMMUNITY_HASH_SALT ?? "").trim();
  return v.length >= 16 ? v : null;
}
