import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { canManageSociety, type AdminCaps } from "./caps";

export interface AdminSociety {
  id: string;
  slug: string;
  shortName: string;
  name: string;
}

/** Societies the admin manages (the societies table is public-read; the filter is by the verified role rows). */
export async function listAdminSocieties(db: SupabaseClient<Database>, caps: AdminCaps): Promise<AdminSociety[]> {
  const { data } = await db.from("societies").select("id, slug, short_name, name").order("sort_order");
  return (data ?? [])
    .filter((s) => canManageSociety(caps, s.id))
    .map((s) => ({ id: s.id, slug: s.slug, shortName: s.short_name, name: s.name }));
}

/** `?society=<slug>` validated against the admin's own list; anything else is ignored. */
export function pickSociety(societies: readonly AdminSociety[], slug: string | string[] | undefined): AdminSociety | null {
  if (typeof slug !== "string") return null;
  return societies.find((s) => s.slug === slug) ?? null;
}
