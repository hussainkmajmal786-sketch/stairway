"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/lib/admin/auth";
import { hashInviteToken, INVITE_TOKEN_RE, inviteExpiry, inviteUrl, MAX_OPEN_INVITES, newInviteToken } from "@/lib/admin/invite";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "@/lib/admin/result";
import { getSiteData } from "@/lib/site/load";
import { createClient } from "@/lib/supabase/server";

// Every action here is super-admin only except acceptInviteAction (needs a session, not a role). No action ever
// logs, audits, revalidates or returns a raw token other than the one-time link returned by createInviteAction.

const UuidIn = z.uuid();
const INVALID_INVITE = "This invite link is invalid, already used, expired or for a different account.";

const CreateInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.enum(["super_admin", "society_admin"]),
  societyId: z.uuid().optional(),
});

export async function createInviteAction(input: unknown): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const p = CreateInput.safeParse(input);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  const { email, role, societyId } = p.data;
  if (role === "society_admin" && !societyId) return fail("invalid_input", "Choose a society.", { societyId: "Choose a society." });
  if (role === "super_admin" && societyId) return fail("invalid_input", "A super admin invite has no society.");

  if (societyId) {
    const { data: soc } = await a.db.from("societies").select("id").eq("id", societyId).maybeSingle();
    if (!soc) return fail("invalid_input", "That society does not exist.", { societyId: "Choose a society." });
  }
  const open = await a.db
    .from("admin_invites")
    .select("id", { count: "exact", head: true })
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
  if (open.error) return { ok: false, error: mapDbError(open.error) };
  if ((open.count ?? 0) >= MAX_OPEN_INVITES) return fail("conflict", "Too many open invites. Revoke some first.");

  const token = newInviteToken();
  const expiresAt = inviteExpiry(Date.now()).toISOString();
  const ins = await a.db.from("admin_invites").insert({
    email, role, society_id: societyId ?? null, token_hash: await hashInviteToken(token), created_by: a.ctx.userId, expires_at: expiresAt,
  });
  if (ins.error) return { ok: false, error: mapDbError(ins.error) };
  revalidatePath("/admin/people");
  const { settings } = await getSiteData();
  return okResult({ url: inviteUrl(settings.siteUrl, token), expiresAt });
}

export async function revokeInviteAction(input: unknown): Promise<ActionResult> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const id = UuidIn.safeParse((input as { inviteId?: unknown } | null)?.inviteId);
  if (!id.success) return fail("invalid_input");
  const { data, error } = await a.db
    .from("admin_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id.data)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id");
  if (error) return { ok: false, error: mapDbError(error) };
  if (!data || data.length === 0) return fail("not_found", "That invite is no longer open.");
  revalidatePath("/admin/people");
  return okResult(undefined);
}

export async function revokeRoleAction(input: unknown): Promise<ActionResult> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const id = UuidIn.safeParse((input as { roleId?: unknown } | null)?.roleId);
  if (!id.success) return fail("invalid_input");
  const { data: row, error: readError } = await a.db.from("admin_roles").select("id, user_id").eq("id", id.data).maybeSingle();
  if (readError) return { ok: false, error: mapDbError(readError) };
  if (!row) return fail("not_found", "That role no longer exists.");
  if (row.user_id === a.ctx.userId) return fail("locked", "Ask another super admin to remove you.");
  // The database refuses to remove the last super admin (surfaced as a friendly `locked` message).
  const { data, error } = await a.db.from("admin_roles").delete().eq("id", id.data).select("id");
  if (error) return { ok: false, error: mapDbError(error) };
  if (!data || data.length === 0) return fail("not_found", "That role no longer exists.");
  revalidatePath("/admin/people");
  return okResult(undefined);
}

/** Needs a signed-in session, not a role. The token is validated, hashed and compared only inside the database. */
export async function acceptInviteAction(token: unknown): Promise<ActionResult<{ role: string }>> {
  if (typeof token !== "string" || !INVITE_TOKEN_RE.test(token)) return fail("not_found", INVALID_INVITE);
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return fail("not_signed_in", "Please sign in to accept this invite.");
  const { data, error } = await db.rpc("accept_admin_invite", { p_token_hash: await hashInviteToken(token) });
  if (error) {
    if ((error.message ?? "").trim().toLowerCase() === "not_signed_in") {
      return fail("not_signed_in", "Please sign in to accept this invite.");
    }
    return fail("not_found", INVALID_INVITE); // uniform: no oracle for which condition failed
  }
  const role = (data as { role?: unknown } | null)?.role;
  if (typeof role !== "string") return fail("not_found", INVALID_INVITE);
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

const SearchInput = z.object({ q: z.string().trim().min(2).max(60) });

export async function searchPeopleAction(
  input: unknown,
): Promise<ActionResult<{ id: string; handle: string; fullName: string; college: string }[]>> {
  const a = await authorize({ kind: "super" });
  if (!a.ok) return { ok: false, error: a.error };
  const p = SearchInput.safeParse(input);
  if (!p.success) return { ok: false, error: fromZod(p.error) };
  // Strip everything that has meaning in a PostgREST filter / LIKE pattern.
  const q = p.data.q.replace(/[^\p{L}\p{N} ._-]/gu, "").trim();
  if (q.length < 2) return okResult([]);
  const { data, error } = await a.db
    .from("profiles")
    .select("id, handle, full_name, college")
    .or(`handle.ilike.%${q}%,full_name.ilike.%${q}%`)
    .not("handle", "like", "deleted-%")
    .order("handle")
    .limit(10);
  if (error) return { ok: false, error: mapDbError(error) };
  return okResult(
    (data ?? []).slice(0, 10).map((r) => ({ id: r.id, handle: r.handle, fullName: r.full_name, college: r.college })),
  );
}
