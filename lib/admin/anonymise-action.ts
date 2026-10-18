"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/admin/auth";
import { confirmMatches } from "@/lib/admin/invite";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "@/lib/admin/result";
import { serviceRoleKey } from "@/lib/payments/config";
import { createAdminClient } from "@/lib/supabase/admin";

const Input = z.object({ userId: z.uuid(), confirmHandle: z.string().max(80) });
const PAGE = 100;
const MAX_ROUNDS = 5;

/**
 * Erases a person's data (the database function does the heavy lifting under the caller's own session). Only AFTER it
 * succeeds is the service role used, solely to delete the user's avatar objects under `<uid>/` in the avatars bucket.
 * That cleanup is best effort and bounded (5 x 100 objects). Never returns emails.
 */
export async function anonymiseUserAction(
  input: unknown,
): Promise<ActionResult<{ registrationsKept: number; avatarsRemoved: boolean }>> {
  const a = await authorize({ kind: "super" }); // 1. authorise first
  if (!a.ok) return { ok: false, error: a.error };
  const p = Input.safeParse(input);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  const { userId, confirmHandle } = p.data;

  const { data: prof, error: readError } = await a.db.from("profiles").select("handle").eq("id", userId).maybeSingle();
  if (readError) return { ok: false, error: mapDbError(readError) };
  if (!prof) return fail("not_found", "We could not find that person.");
  if (!confirmMatches(confirmHandle, prof.handle)) {
    return fail("invalid_input", "Type their handle exactly to confirm.", { confirmHandle: "Type their handle exactly." });
  }

  const { data, error } = await a.db.rpc("anonymise_user", { p_user_id: userId }); // 2. database (re-checks everything)
  if (error) return { ok: false, error: mapDbError(error) };
  const kept = z.object({ registrations_kept: z.number() }).safeParse(data);
  const registrationsKept = kept.success ? kept.data.registrations_kept : 0;

  let avatarsRemoved = false; // 3. storage cleanup with the service role, after the database part is done
  try {
    const key = serviceRoleKey();
    if (key) {
      const bucket = createAdminClient(key).storage.from("avatars");
      avatarsRemoved = true;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const listed = await bucket.list(userId, { limit: PAGE });
        if (listed.error) {
          avatarsRemoved = false;
          break;
        }
        const names = (listed.data ?? []).map((o) => `${userId}/${o.name}`);
        if (names.length === 0) break;
        const removed = await bucket.remove(names);
        if (removed.error) {
          avatarsRemoved = false;
          break;
        }
        if (names.length < PAGE) break;
        if (round === MAX_ROUNDS - 1) avatarsRemoved = false; // more remain than the bound allows
      }
    }
  } catch {
    avatarsRemoved = false;
  }
  revalidatePath("/admin/people");
  return okResult({ registrationsKept, avatarsRemoved });
}
