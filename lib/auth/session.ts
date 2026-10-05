import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseSessionCookie } from "./cookies";
import type { AuthProfile, AuthState, AuthUser } from "./types";

const ANON: AuthState = { user: null, profile: null };

/** Who is signed in for this request (verified locally from the JWT; one small profile query). */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const store = await cookies();
  if (!hasSupabaseSessionCookie(store.getAll().map((c) => c.name))) return ANON;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return ANON;
  const { data: row } = await supabase
    .from("profiles")
    .select("handle, full_name, avatar_url, onboarded")
    .eq("id", claims.sub)
    .maybeSingle();
  const user: AuthUser = { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
  const profile: AuthProfile | null = row
    ? { handle: row.handle, fullName: row.full_name, avatarUrl: row.avatar_url, onboarded: row.onboarded }
    : null;
  return { user, profile };
});

/** Page guard: redirects visitors without a session to /login (returning to `next`). */
export async function requireSignedIn(next: string): Promise<{ user: AuthUser; profile: AuthProfile | null }> {
  const { user, profile } = await getAuthState();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { user, profile };
}

/** Page guard: signed in AND finished onboarding. */
export async function requireOnboarded(next: string): Promise<{ user: AuthUser; profile: AuthProfile }> {
  const { user, profile } = await requireSignedIn(next);
  if (!profile?.onboarded) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return { user, profile };
}
