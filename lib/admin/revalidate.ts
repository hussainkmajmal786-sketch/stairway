import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Public pages that show an event, plus the admin list. Unpublished events only touch the admin paths. */
export async function revalidateEventPaths(
  db: SupabaseClient<Database>,
  e: { slug: string; societyId: string; published: boolean; eventId?: string },
) {
  revalidatePath("/admin/events");
  if (e.eventId) revalidatePath(`/admin/events/${e.eventId}`);
  if (!e.published) return;
  revalidatePath(`/events/${e.slug}`);
  revalidatePath("/");
  const { data } = await db.from("societies").select("slug").eq("id", e.societyId).maybeSingle();
  if (data?.slug) revalidatePath(`/s/${data.slug}`);
}
