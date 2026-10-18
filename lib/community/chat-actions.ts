"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/admin/auth";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "@/lib/admin/result";

// Super admin only. Every action authorises FIRST (uniform `forbidden`, zero DB calls for anyone else), validates with
// strict zod, then calls the matching admin_chat_* RPC (which re-checks super admin itself). Replies and user sends do
// NOT go through here: they go browser -> chat_send directly.

const REASONS = ["abuse", "spam", "other"] as const;
export type BlockReason = (typeof REASONS)[number];

const ThreadId = z.uuid();
const UserId = z.uuid();
const MessageId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const BlockInput = z.object({ userId: z.uuid(), reason: z.enum(REASONS) }).strict();

function dbError(e: { message?: string | null; code?: string | null }): ActionResult<never> {
  const msg = (e.message ?? "").trim().toLowerCase();
  if (msg === "not_found") return fail("not_found");
  if (msg === "admin_account") return fail("locked", "Admin accounts cannot be blocked.");
  if (msg === "invalid_input") return fail("invalid_input");
  if (msg === "not_user_message") return fail("locked", "Only member messages can be flagged.");
  return { ok: false, error: mapDbError(e) };
}

function revalidate() {
  try {
    revalidatePath("/admin/chat");
  } catch {
    // best effort: the write already committed
  }
}

export async function closeThread(threadId: unknown): Promise<ActionResult> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const p = ThreadId.safeParse(threadId);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  const { error } = await a.db.rpc("admin_chat_close", { p_thread_id: p.data });
  if (error) return dbError(error);
  revalidate();
  return okResult(undefined);
}

export async function blockUser(input: unknown): Promise<ActionResult> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const p = BlockInput.safeParse(input);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  const { error } = await a.db.rpc("admin_chat_block", { p_user_id: p.data.userId, p_reason: p.data.reason });
  if (error) return dbError(error);
  revalidate();
  return okResult(undefined);
}

export async function unblockUser(userId: unknown): Promise<ActionResult> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const p = UserId.safeParse(userId);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  const { error } = await a.db.rpc("admin_chat_unblock", { p_user_id: p.data });
  if (error) return dbError(error);
  revalidate();
  return okResult(undefined);
}

export async function flagMessage(messageId: unknown): Promise<ActionResult> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const p = MessageId.safeParse(messageId);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  const { error } = await a.db.rpc("admin_chat_flag", { p_message_id: p.data });
  if (error) return dbError(error);
  revalidate();
  return okResult(undefined);
}
