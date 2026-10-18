"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/admin/auth";
import { fail, type ActionResult } from "@/lib/admin/result";
import { paymentsConfig } from "@/lib/payments/config";
import { refundRegistration } from "@/lib/payments/refunds";
import { createAdminClient } from "@/lib/supabase/admin";

const httpFetch = (url: string, init?: RequestInit) => fetch(url, init);

// Audit summaries hold numbers and booleans only (the database rejects strings): one code per failure reason.
const REASON_CODE = { disabled: 1, not_found: 2, not_refundable: 3, in_progress: 4, db_error: 5, razorpay_error: 6 } as const;
// log_admin_event accepts a null society for super admins (typed as string by the generator).
const NO_SOCIETY = null as unknown as string;

/**
 * Full refund of one registration. Super admin only, and only while payments are switched on in BOTH the
 * environment and the database. The service role is built here, per call, and used solely by refundRegistration().
 * Errors carry fixed copy: never Razorpay bodies, ids or keys.
 */
export async function refundRegistrationAction(
  input: unknown,
): Promise<ActionResult<{ outcome: "refunded" | "already_refunded" }>> {
  const id = z.uuid().safeParse(input);
  if (!id.success) return fail("invalid_input");
  const a = await authorize({ kind: "super" }); // 1. super admin only, re-checked server side
  if (!a.ok) return { ok: false, error: a.error };
  const cfg = paymentsConfig(); // 2. env flag + every secret present
  if (!cfg.enabled) return fail("payments_disabled", "Payments are switched off, so refunds are disabled.");
  const flag = await a.db.rpc("admin_payments_flag"); // 3. database flag
  if (flag.error || flag.data !== true) return fail("payments_disabled", "Payments are switched off, so refunds are disabled.");
  const { data: reg } = await a.db
    .from("registrations")
    .select("status, razorpay_payment_id")
    .eq("id", id.data)
    .maybeSingle();
  if (!reg || !reg.razorpay_payment_id || (reg.status !== "refund_needed" && reg.status !== "confirmed")) {
    return fail("locked", "This registration has no payment that can be refunded."); // 4. state check
  }
  const attempt = await a.db.rpc("log_admin_event", {
    p_action: "refund.attempt", p_target_type: "registration", p_target_id: id.data, p_society_id: NO_SOCIETY, p_summary: {},
  });
  if (attempt.error) return fail("unavailable", "The refund could not be started. Nothing was changed.");
  const r = await refundRegistration(
    { creds: { keyId: cfg.keyId, keySecret: cfg.keySecret }, fetch: httpFetch, db: createAdminClient(cfg.serviceRoleKey) },
    id.data,
  );
  await a.db.rpc("log_admin_event", {
    p_action: "refund.result",
    p_target_type: "registration",
    p_target_id: id.data,
    p_society_id: NO_SOCIETY,
    p_summary: r.ok ? { ok: true, already: r.outcome === "already_refunded" } : { ok: false, reason: REASON_CODE[r.reason] },
  });
  revalidatePath("/admin", "layout");
  if (r.ok) return { ok: true, data: { outcome: r.outcome } };
  const code =
    r.reason === "in_progress" ? "conflict"
    : r.reason === "disabled" ? "payments_disabled"
    : r.reason === "not_found" ? "not_found"
    : r.reason === "not_refundable" ? "locked"
    : "unavailable";
  return fail(
    code,
    r.reason === "razorpay_error"
      ? `Razorpay refused the refund (${r.code}). Nothing was changed.`
      : "The refund could not be completed. Check the registration and try again.",
  );
}
