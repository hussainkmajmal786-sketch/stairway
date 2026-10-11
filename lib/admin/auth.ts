import "server-only";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { adminCaps, canManageSociety, type AdminCaps } from "./caps";
import { fail, type AdminError } from "./result";

export interface AdminContext extends AdminCaps {
  userId: string;
}
export type Scope =
  | { kind: "any" }
  | { kind: "super" }
  | { kind: "society"; societyId: string }
  | { kind: "event"; eventId: string };
type Db = SupabaseClient<Database>;

export type AuthorizeResult =
  | { ok: true; ctx: AdminContext; db: Db; societyId: string | null }
  | { ok: false; error: AdminError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identity from the verified JWT; roles re-read from admin_roles on EVERY call (RLS lets a super admin read all
 * rows, so the explicit user_id filter is required). Nothing from the client is trusted. Never cached.
 */
export async function getAdminContext(db?: Db): Promise<AdminContext | null> {
  const client = db ?? (await createClient());
  const { data, error } = await client.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") return null;
  const { data: rows, error: rolesError } = await client.from("admin_roles").select("role, society_id").eq("user_id", sub);
  if (rolesError || !rows || rows.length === 0) return null;
  return { userId: sub, ...adminCaps(rows) };
}

/** For server actions: re-authenticates and scopes. Never throws; every miss is a uniform `forbidden`. */
export async function authorize(scope: Scope, existingDb?: Db): Promise<AuthorizeResult> {
  const denied = { ok: false as const, error: fail("forbidden").error };
  // Reject malformed ids before any I/O.
  if (scope.kind === "society" && !UUID.test(scope.societyId)) return denied;
  if (scope.kind === "event" && !UUID.test(scope.eventId)) return denied;
  const db = existingDb ?? (await createClient());
  const ctx = await getAdminContext(db);
  if (!ctx) return denied;
  let societyId: string | null = null;
  if (scope.kind === "super" && !ctx.isSuper) return denied;
  if (scope.kind === "society") {
    if (!canManageSociety(ctx, scope.societyId)) return denied;
    societyId = scope.societyId;
  }
  if (scope.kind === "event") {
    // The society comes from the row, never from the request. Not found and not yours look the same.
    const { data } = await db.from("events").select("society_id").eq("id", scope.eventId).maybeSingle();
    if (!data || !canManageSociety(ctx, data.society_id)) return denied;
    societyId = data.society_id;
  }
  return { ok: true, ctx, db, societyId };
}

/** For pages: signed out -> login, otherwise a 404 for any miss (no role disclosure). */
export async function requireAdmin(next: string, scope: Scope = { kind: "any" }) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect(`/login?next=${encodeURIComponent(next)}`);
  const r = await authorize(scope, db);
  if (!r.ok) notFound();
  return { ctx: r.ctx, db: r.db, societyId: r.societyId };
}
