import "server-only";
import { z } from "zod";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { paymentsConfig } from "./config";
import {
  fetchRefunds,
  PAYMENT_ID,
  RazorpayError,
  refundPayment,
  type FetchLike,
  type RazorpayCredentials,
  type RazorpayRefund,
} from "./razorpay";

// Full refunds initiated from st(AI)rway. NOT a server action (that would be a public endpoint): the Phase 5 admin
// dashboard calls it from a super-admin-only action, which must authorise the caller first. Never automatic: a user
// cancelling a paid seat only sets refund_needed.
//
// Never two refunds for one payment:
// 1. claim_refund takes a 2-minute lease, so two admins do not normally both reach Razorpay.
// 2. Before any POST we GET the payment's refunds and reuse an existing full refund (a crashed or timed-out earlier
//    attempt, or one made in the Razorpay dashboard) instead of creating another (review M-9).
// 3. If the POST fails or times out we GET once more: the refund may have been created anyway. We never re-POST in
//    the same call; the next call (after the lease lapses) starts with a GET again.
// 4. Razorpay itself refuses refunds beyond the captured amount, so even a race past the lease cannot double-refund.
// At most 3 Razorpay calls (8 s timeout each) and 2 RPCs: well inside the lease and CPU-light. Results carry only
// fixed reasons and sanitised Razorpay codes, never ids from the database, keys, secrets or response bodies.

export type RefundResult =
  | { ok: true; outcome: "refunded" | "already_refunded"; refundId: string }
  | { ok: false; reason: "disabled" | "not_found" | "not_refundable" | "in_progress" | "db_error" }
  /** `code`: Razorpay's sanitised error code (see RazorpayError), or PARTIALLY_REFUNDED | PARTIAL_REFUND | REFUND_FAILED. */
  | { ok: false; reason: "razorpay_error"; code: string };

export interface RefundDeps {
  creds: RazorpayCredentials;
  fetch: FetchLike;
  /** Service-role client (claim_refund / mark_refunded are service_role-only). */
  db: AdminClient;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Claim = z.object({
  payment_id: z.string().regex(PAYMENT_ID),
  amount_paise: z.number().int().positive().max(2_147_483_647),
});
const Mark = z.object({ outcome: z.string() });
const CLAIM_ERRORS: Record<string, "not_found" | "not_refundable" | "in_progress"> = {
  registration_not_found: "not_found",
  not_refundable: "not_refundable",
  refund_in_progress: "in_progress",
};

const rzError = (code: string): RefundResult => ({ ok: false, reason: "razorpay_error", code });
const DB_ERROR: RefundResult = { ok: false, reason: "db_error" };

type Existing = { kind: "none" } | { kind: "full"; refund: RazorpayRefund } | { kind: "partial" };

/** What Razorpay already holds for this payment. Failed refunds returned no money and are ignored. */
function existingRefund(refunds: RazorpayRefund[], paymentId: string, amountPaise: number): Existing {
  const live = refunds.filter((r) => r.payment_id === paymentId && r.status !== "failed");
  const full = live.filter((r) => r.amount === amountPaise);
  if (full.length > 0) return { kind: "full", refund: full.find((r) => r.status === "processed") ?? full[0] };
  return live.length > 0 ? { kind: "partial" } : { kind: "none" };
}

/** A thrown client error (network) becomes an ordinary error result; its text is never surfaced. */
async function safeRpc<T>(call: () => PromiseLike<{ data: T; error: { message: string } | null }>) {
  try {
    return await call();
  } catch {
    return { data: null, error: { message: "" } };
  }
}

export async function refundRegistration(deps: RefundDeps, registrationId: string): Promise<RefundResult> {
  if (typeof registrationId !== "string" || !UUID.test(registrationId)) return { ok: false, reason: "not_found" };

  const { data: claimData, error: claimErr } = await safeRpc(() =>
    deps.db.rpc("claim_refund", { p_registration_id: registrationId }),
  );
  if (claimErr) return { ok: false, reason: CLAIM_ERRORS[claimErr.message?.trim() ?? ""] ?? "db_error" };
  const claim = Claim.safeParse(claimData);
  if (!claim.success) return DB_ERROR;
  const paymentId = claim.data.payment_id;
  const amountPaise = claim.data.amount_paise;

  let refund: RazorpayRefund;
  let outcome: "refunded" | "already_refunded";
  try {
    const before = existingRefund(await fetchRefunds(deps.creds, deps.fetch, paymentId), paymentId, amountPaise);
    if (before.kind === "partial") return rzError("PARTIALLY_REFUNDED");
    if (before.kind === "full") {
      refund = before.refund;
      outcome = "already_refunded";
    } else {
      try {
        refund = await refundPayment(deps.creds, deps.fetch, paymentId, {
          amountPaise,
          notes: { source: "stairway", registration_id: registrationId },
        });
        outcome = "refunded";
      } catch (postErr) {
        if (!(postErr instanceof RazorpayError)) throw postErr;
        // Timed out, dropped, 5xx — or refused because a concurrent call already refunded. Look again; never re-POST.
        let after: Existing;
        try {
          after = existingRefund(await fetchRefunds(deps.creds, deps.fetch, paymentId), paymentId, amountPaise);
        } catch {
          return rzError(postErr.code);
        }
        if (after.kind !== "full") return rzError(postErr.code);
        refund = after.refund;
        // Ambiguous failures (no answer / server error) may have created it in this very call.
        outcome = postErr.status === 0 || postErr.status >= 500 ? "refunded" : "already_refunded";
      }
      if (refund.status === "failed") return rzError("REFUND_FAILED");
      if (refund.payment_id !== paymentId) return rzError("BAD_RESPONSE");
    }
  } catch (e) {
    if (e instanceof RazorpayError) return rzError(e.code);
    throw e;
  }

  // Record the refund actually made (its own amount): a mismatch comes back as partial_refund for an admin to see.
  const { data, error } = await safeRpc(() =>
    deps.db.rpc("mark_refunded", {
      p_registration_id: registrationId,
      p_payment_id: paymentId,
      p_refund_id: refund.id,
      p_amount_paise: refund.amount,
      p_source: "refund_api",
    }),
  );
  if (error) return DB_ERROR; // the refund.processed webhook (or the next call, via the GET) records it later
  const mark = Mark.safeParse(data);
  if (!mark.success) return DB_ERROR;
  switch (mark.data.outcome) {
    case "refunded":
      return { ok: true, outcome, refundId: refund.id };
    case "already_refunded":
      return { ok: true, outcome: "already_refunded", refundId: refund.id };
    case "partial_refund":
      return rzError("PARTIAL_REFUND");
    default:
      return DB_ERROR;
  }
}

/** Flag-checked entry point for the (Phase 5) admin action. The caller must already have authorised the admin. */
export async function refundRegistrationById(registrationId: string): Promise<RefundResult> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return { ok: false, reason: "disabled" };
  return refundRegistration(
    {
      creds: { keyId: cfg.keyId, keySecret: cfg.keySecret },
      fetch: (url, init) => fetch(url, init),
      db: createAdminClient(cfg.serviceRoleKey),
    },
    registrationId,
  );
}
