"use server";
import "server-only";
import { headers } from "next/headers";
import { fail, fromZod, okResult, type ActionResult } from "@/lib/admin/result";
import { serviceRoleKey } from "@/lib/payments/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { formsHashSalt } from "./config";
import { CommunityFormSchema, clientIp, formErrorCopy, formVerdict, hashIp } from "./forms";

// The submit RPC is service_role-only (it trusts p_user_id and p_ip_hash), so this module is the second service-role
// importer of the phase. Order matters: validate -> honeypot / timing verdict -> only THEN build the service client.
// Never returns SQL text, never logs input.

function mapSubmitError(e: { message?: string | null; code?: string | null }): ActionResult<never> {
  const msg = (e.message ?? "").trim().toLowerCase();
  if (msg === "rate_limited") return fail("too_many", formErrorCopy("rate_limited"));
  if (msg === "busy") return fail("unavailable", formErrorCopy("busy"));
  if (msg === "invalid_input" || e.code === "23514" || e.code === "22P02") return fail("invalid_input", formErrorCopy("invalid_input"));
  if (/fetch failed|network|timeout|econn/.test(msg)) return fail("unavailable", formErrorCopy("unavailable"));
  return fail("unknown", formErrorCopy("unknown"));
}

function stripUndefined(d: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
}

export async function submitCommunityRequest(input: unknown): Promise<ActionResult<{ received: true }>> {
  const parsed = CommunityFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const f = parsed.data;

  // Bots get the same success answer and cost the database nothing.
  if (formVerdict({ hp: f.hp, startedAt: f.startedAt, now: Date.now() }) === "bot") return okResult({ received: true });

  try {
    const key = serviceRoleKey();
    if (!key) return fail("unavailable", formErrorCopy("unavailable"));

    const anonymous = f.kind === "feedback" && f.anonymous === true;
    // Anonymous rows store no ip hash (DB check) and no user id; the DB counters still bound abuse.
    let ipHash: string | null = null;
    let userId: string | null = null;
    if (!anonymous) {
      const salt = formsHashSalt();
      const ip = clientIp(await headers());
      ipHash = salt && ip ? await hashIp(ip, salt) : null;
      // The id comes from the verified session only, never from the request body.
      const session = await createClient();
      const { data } = await session.auth.getClaims();
      const sub = data?.claims?.sub;
      userId = typeof sub === "string" ? sub : null;
    }

    const named = "name" in f ? f : null;
    const svc = createAdminClient(key);
    const { error } = await svc.rpc("submit_community_request", {
      p_kind: f.kind,
      p_anonymous: anonymous,
      p_name: (named?.name ?? null) as string,
      p_email: (named?.email ?? null) as string,
      p_phone: (named?.phone ?? null) as string,
      p_organisation: (named?.organisation ?? null) as string,
      p_subject: f.subject,
      p_message: f.message,
      p_details: stripUndefined(f.details) as Json,
      p_ip_hash: ipHash as string,
      p_hp: "",
      p_user_id: (userId ?? undefined) as string,
    });
    if (error) return mapSubmitError(error);
    return okResult({ received: true });
  } catch {
    return fail("unknown", formErrorCopy("unknown"));
  }
}
