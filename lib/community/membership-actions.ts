"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, mapDbError, okResult, type ActionResult } from "@/lib/admin/result";
import { createClient } from "@/lib/supabase/server";
import { MemberNumberSchema, PROOF_PATH, claimErrorCopy } from "./membership";

// Public POST endpoint: identity comes from the verified JWT (never the client), input is validated with zod BEFORE
// any RPC, the proof path must live in the caller's own folder, and the RPC runs on the session client (RLS + definer
// function re-check everything). Database error text never reaches the client.

const Input = z
  .object({ memberNumber: MemberNumberSchema, proofPath: z.string().regex(PROOF_PATH).nullable() })
  .strict();

const RpcResult = z.object({
  status: z.enum(["verified", "pending_review", "proof_required", "rate_limited"]),
  claim_id: z.guid().nullish(),
  verified_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export interface ClaimOutcome {
  status: "verified" | "pending_review" | "proof_required" | "rate_limited";
  claimId?: string;
  verifiedUntil?: string;
}

const CODES = new Set(["invalid_number", "invalid_proof", "not_onboarded", "name_locked", "not_signed_in"]);

export async function submitClaim(input: unknown): Promise<ActionResult<ClaimOutcome>> {
  const db = await createClient();
  const { data: claims, error: claimsError } = await db.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (claimsError || typeof uid !== "string") return fail("not_signed_in");

  const parsed = Input.safeParse(input);
  if (!parsed.success) return fail("invalid_input", claimErrorCopy("invalid_number"));
  const { memberNumber, proofPath } = parsed.data;
  // The server never trusts a client-supplied path: the first segment must be the caller's own uid.
  if (proofPath !== null && !proofPath.startsWith(`${uid}/`)) return fail("invalid_input", claimErrorCopy("invalid_proof"));

  const { data, error } = await db.rpc("submit_ieee_claim", { p_member_number: memberNumber, p_proof_path: proofPath as string });
  if (error) {
    const msg = (error.message ?? "").trim().toLowerCase();
    if (CODES.has(msg)) return fail("invalid_input", claimErrorCopy(msg));
    return { ok: false, error: mapDbError(error) };
  }
  const r = RpcResult.safeParse(data);
  if (!r.success) return fail("unknown");
  try {
    revalidatePath("/me");
    revalidatePath("/me/membership");
  } catch {
    // best effort: the write already committed
  }
  const out: ClaimOutcome = { status: r.data.status };
  if (r.data.claim_id) out.claimId = r.data.claim_id;
  if (r.data.verified_until) out.verifiedUntil = r.data.verified_until;
  return okResult(out);
}

const UploadInput = z.object({ type: z.enum(["image/jpeg", "image/png", "image/webp"]) }).strict();
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/**
 * Issues a one-time signed upload URL for the private `ieee-proof` bucket. The object path is derived HERE from the
 * session user and a random UUID; the client contributes only the image type (a closed enum). The bucket itself
 * enforces images only and 5 MB, and storage policies cap 10 objects per user.
 */
export async function createProofUpload(input: unknown): Promise<ActionResult<{ path: string; token: string }>> {
  const db = await createClient();
  const { data: claims, error: claimsError } = await db.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (claimsError || typeof uid !== "string") return fail("not_signed_in");
  const parsed = UploadInput.safeParse(input);
  if (!parsed.success) return fail("invalid_input", claimErrorCopy("invalid_proof"));
  const path = `${uid}/${crypto.randomUUID()}.${EXT[parsed.data.type]}`;
  try {
    const { data, error } = await db.storage.from("ieee-proof").createSignedUploadUrl(path);
    if (error || !data?.token) return fail("unavailable");
    return okResult({ path, token: data.token });
  } catch {
    return fail("unavailable");
  }
}
