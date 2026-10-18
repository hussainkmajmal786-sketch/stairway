"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/admin/auth";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "@/lib/admin/result";
import { UpdateInput } from "./requests";

// Super admin only. Authorises FIRST (uniform `forbidden`, zero DB calls otherwise), then validates, then updates
// exactly status + admin_note through the session client (RLS + column grants are the second guard). The generic
// audit trigger records column names and the status change, never the note text.

export async function updateRequest(input: unknown): Promise<ActionResult> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const p = UpdateInput.safeParse(input);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  const { data, error } = await a.db
    .from("community_requests")
    .update({ status: p.data.status, admin_note: p.data.note.trim() })
    .eq("id", p.data.id)
    .select("id");
  if (error) return { ok: false, error: mapDbError(error) };
  if (!Array.isArray(data) || data.length === 0) return fail("not_found");
  try {
    revalidatePath("/admin/requests");
  } catch {
    // best effort: the write already committed
  }
  return okResult(undefined);
}
