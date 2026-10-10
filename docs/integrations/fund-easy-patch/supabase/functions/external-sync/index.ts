// PROPOSED — NOT APPLIED. st(AI)rway -> Fund Easy sync receiver (contract v1). verify_jwt = false: authenticated by
// HMAC + timestamp with STAIRWAY_SYNC_SECRET. The service role is used only inside this function.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { json, requireEnv } from "../_shared/http.ts";
import { verifySignature } from "./verify.ts";

const MAX_BODY = 16 * 1024;
const PERMANENT: Record<string, number> = {
  malformed: 400,
  conflict_existing_order: 422,
  unsupported_version: 422,
  unsupported_type: 422,
};

interface Envelope {
  contract_version: number;
  idempotency_key: string;
  type: string;
  data?: { attendee?: { email?: unknown; full_name?: unknown } };
}

async function findOrCreateUser(admin: SupabaseClient, email: string, name: string | undefined): Promise<string> {
  const { data: found, error } = await admin.rpc("external_find_user", { p_email: email });
  if (error) throw new Error("user lookup failed");
  if (typeof found === "string") return found;
  // Passwordless account; handle_new_user creates the profile from user_metadata.name. "Forgot password" sets one.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: name ? { name } : {},
  });
  if (!createError && created?.user) return created.user.id;
  // Created by a concurrent delivery: look it up again.
  const { data: again } = await admin.rpc("external_find_user", { p_email: email });
  if (typeof again === "string") return again;
  throw new Error("user create failed");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ ok: false, error: "too_large" }, 413);
    const ok = await verifySignature(
      requireEnv("STAIRWAY_SYNC_SECRET"),
      raw,
      req.headers.get("x-stairway-timestamp"),
      req.headers.get("x-stairway-signature"),
      Date.now(),
    );
    if (!ok) return json({ ok: false, error: "bad_signature" }, 401);

    let env: Envelope;
    try {
      env = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "malformed" }, 400);
    }
    if (env?.contract_version !== 1) return json({ ok: false, error: "unsupported_version" }, 422);
    if (typeof env.idempotency_key !== "string" || req.headers.get("idempotency-key") !== env.idempotency_key) {
      return json({ ok: false, error: "malformed" }, 400);
    }

    const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let userId: string | null = null;
    if (env.type === "registration.confirmed") {
      const email = env.data?.attendee?.email;
      const name = env.data?.attendee?.full_name;
      if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(email)) return json({ ok: false, error: "malformed" }, 400);
      userId = await findOrCreateUser(admin, email.trim(), typeof name === "string" ? name.slice(0, 120) : undefined);
    }

    const { data, error } = await admin.rpc("import_external_ticket", { p_envelope: env, p_user_id: userId });
    if (error) {
      const code = (error.message ?? "").trim();
      if (PERMANENT[code]) return json({ ok: false, error: code }, PERMANENT[code]);
      // Bad data (not-null / check / invalid text / datetime violations) can never succeed on retry.
      if (error.code === "23502" || error.code === "23514" || (error.code ?? "").startsWith("22")) {
        return json({ ok: false, error: "malformed" }, 400);
      }
      console.error("external-sync import failed", error.code);
      return json({ ok: false, error: "retry" }, 500);
    }
    return json({ ok: true, ...(data as Record<string, unknown>) }, 200);
  } catch (e) {
    console.error("external-sync failed", e instanceof Error ? e.name : "unknown");
    return json({ ok: false, error: "retry" }, 500);
  }
});
