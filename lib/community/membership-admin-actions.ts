"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/admin/auth";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "@/lib/admin/result";
import { REJECT_REASONS } from "./membership";

// Every action authorises FIRST (super admin only; society admins, plain users and signed-out callers all get the same
// uniform `forbidden` and cause zero database or storage calls), then validates with strict zod, then calls the DB
// functions (which re-check super admin themselves). Member numbers, names, proof URLs and paths are never logged.

const PATH = "/admin/membership";

const RosterRowSchema = z.object({
  n: z.string().max(12),
  e: z.string().max(12),
  name: z.string().max(120).optional(),
});
const ImportInput = z.object({ rows: z.array(RosterRowSchema).max(1000), replace: z.boolean() }).strict();

const DecideInput = z.union([
  z
    .object({
      claimId: z.uuid(),
      approve: z.literal(true),
      verifiedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      // The officer's statement that they saw an active membership in the IEEE Membership Validator.
      validatorConfirmed: z.literal(true),
    })
    .strict(),
  z.object({ claimId: z.uuid(), approve: z.literal(false), reason: z.enum(REJECT_REASONS) }).strict(),
]);
const ClaimId = z.uuid();

const CountsOut = z.object({
  rows: z.number().int().min(0),
  extended: z.number().int().min(0),
  auto_verified: z.number().int().min(0),
});

function revalidate() {
  try {
    revalidatePath(PATH);
  } catch {
    // best effort: the write already committed
  }
}

function dbError(e: { message?: string | null; code?: string | null }) {
  const msg = (e.message ?? "").trim().toLowerCase();
  if (msg === "not_found") return fail("not_found");
  if (msg === "invalid_date") return fail("invalid_input", "Choose a date between today and 740 days from now.");
  if (msg === "validator_unconfirmed") return fail("invalid_input", "Confirm that you checked the IEEE Membership Validator.");
  if (msg === "invalid_reason" || msg === "invalid_input") return fail("invalid_input");
  if (e.code === "23505") return fail("conflict", "That number is already verified on another account.");
  return { ok: false as const, error: mapDbError(e) };
}

export async function importRosterChunk(
  input: unknown,
): Promise<ActionResult<{ rows: number; extended: number; autoVerified: number }>> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const p = ImportInput.safeParse(input);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  // Forward only the known fields; the database validates and hashes them.
  const rows = p.data.rows.map((r) => (r.name ? { n: r.n, e: r.e, name: r.name } : { n: r.n, e: r.e }));
  const { data, error } = await a.db.rpc("import_ieee_roster", { p_rows: rows, p_replace: p.data.replace });
  if (error) return dbError(error);
  const o = CountsOut.safeParse(data);
  if (!o.success) return fail("unknown");
  revalidate();
  return okResult({ rows: o.data.rows, extended: o.data.extended, autoVerified: o.data.auto_verified });
}

export async function decideClaim(input: unknown): Promise<ActionResult> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const p = DecideInput.safeParse(input);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  const d = p.data;
  // Approval always goes through the confirmation-recording function; rejection keeps the plain decision.
  const { error } = d.approve
    ? await a.db.rpc("admin_approve_claim", {
        p_claim_id: d.claimId,
        p_verified_until: d.verifiedUntil,
        p_validator_confirmed: d.validatorConfirmed,
      })
    : await a.db.rpc("admin_decide_claim", {
        p_claim_id: d.claimId,
        p_approve: false,
        p_verified_until: null as unknown as string,
        p_reason: d.reason,
      });
  if (error) return dbError(error);
  revalidate();
  return okResult(undefined);
}

export async function revokeClaim(claimId: unknown): Promise<ActionResult> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const id = ClaimId.safeParse(claimId);
  if (!id.success) return { ok: false, error: fromZod(id.error) };
  const { error } = await a.db.rpc("admin_revoke_claim", { p_claim_id: id.data });
  if (error) return dbError(error);
  revalidate();
  return okResult(undefined);
}

/**
 * Proof viewing only through the audited path: the path comes from the database (never from the client), the audit
 * row is written BEFORE a signed URL exists, and the URL (5 minutes) is returned once and never stored or logged.
 */
export async function getProofUrl(claimId: unknown): Promise<ActionResult<{ url: string }>> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const id = ClaimId.safeParse(claimId);
  if (!id.success) return { ok: false, error: fromZod(id.error) };

  const { data: path, error } = await a.db.rpc("admin_claim_proof", { p_claim_id: id.data });
  if (error) return dbError(error);
  if (typeof path !== "string" || path.length === 0) return fail("not_found");

  const { error: auditError } = await a.db.rpc("log_admin_event", {
    p_action: "membership.proof_view",
    p_target_type: "ieee_claim",
    p_target_id: id.data,
    p_society_id: null as unknown as string,
    p_summary: {},
  });
  if (auditError) return fail("unavailable"); // no audit row, no URL

  const signed = await a.db.storage.from("ieee-proof").createSignedUrl(path, 300);
  const url = signed.data?.signedUrl;
  if (signed.error || !url) return fail("unavailable");
  return okResult({ url });
}
