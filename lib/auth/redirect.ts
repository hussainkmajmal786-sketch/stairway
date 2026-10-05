import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Where to send someone who has just signed in: onboarding first, otherwise `next`. */
export async function postSignInPath(supabase: SupabaseClient<Database>, next: string): Promise<string> {
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return `/login?error=auth`;
  const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", sub).maybeSingle();
  return profile?.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`;
}
