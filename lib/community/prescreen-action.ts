"use server";
import "server-only";
import { z } from "zod";
import { authorize } from "@/lib/admin/auth";
import { fail, okResult, type ActionResult } from "@/lib/admin/result";
import { serviceRoleKey } from "@/lib/payments/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { prescreenConfig } from "./config";
import { callVision, comparePrescreen } from "./prescreen";

const Begin = z.object({ proof_path: z.string().min(1), member_number: z.string(), full_name: z.string() });

/**
 * Optional AI pre-screen of a proof image. A hint for the human reviewer only: it NEVER changes the claim status
 * (record_prescreen has no status parameter). Order: config -> identity/ownership -> service-role bookkeeping ->
 * signed URL (120 s) -> vision call -> compare -> record. Never throws; never logs payloads, numbers, names or URLs.
 */
export async function requestPrescreen(claimId: string): Promise<ActionResult<{ ran: boolean }>> {
  const cfg = prescreenConfig();
  if (!cfg.enabled) return okResult({ ran: false }); // 1. flag + key absent: skip silently, no I/O
  if (!z.guid().safeParse(claimId).success) return fail("invalid_input");

  let claim: string | null = null;
  let record: ((ok: boolean, result: Record<string, unknown>) => Promise<void>) | null = null;
  try {
    // 2. the caller must own the claim (RLS on the session client) or be a super admin
    const db = await createClient();
    const { data: claims } = await db.auth.getClaims();
    const uid = claims?.claims?.sub;
    if (typeof uid !== "string") return fail("forbidden");
    const { data: row } = await db.from("ieee_claims").select("id").eq("id", claimId).maybeSingle();
    if (!row) {
      const a = await authorize({ kind: "super" }, db);
      if (!a.ok) return fail("forbidden");
    }
    const key = serviceRoleKey();
    if (!key) return okResult({ ran: false });
    const svc = createAdminClient(key);
    claim = claimId;
    record = async (ok, result) => {
      await svc.rpc("record_prescreen", { p_claim_id: claimId, p_ok: ok, p_result: result as never });
    };

    // 3. DB-enforced limits (2 runs per claim, 100 per day): null means "do not run"
    const { data: begun } = await svc.rpc("begin_prescreen", { p_claim_id: claimId });
    const b = Begin.safeParse(begun);
    if (!b.success) return okResult({ ran: false });

    const signed = await svc.storage.from("ieee-proof").createSignedUrl(b.data.proof_path, 120);
    const url = signed.data?.signedUrl;
    if (signed.error || !url) {
      await record(false, {});
      return okResult({ ran: false });
    }
    const out = await callVision(cfg, url);
    if (!out) {
      await record(false, {});
      return okResult({ ran: false });
    }
    await record(true, comparePrescreen(out, { memberNumber: b.data.member_number, fullName: b.data.full_name }));
    return okResult({ ran: true });
  } catch {
    console.error("ieee prescreen failed");
    try {
      if (claim && record) await record(false, {});
    } catch {
      // nothing more to do
    }
    return okResult({ ran: false });
  }
}
