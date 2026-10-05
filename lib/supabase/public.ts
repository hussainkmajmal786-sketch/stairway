import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

/** Anonymous, cookie-less client for public reads (cache-friendly, RLS as `anon`). */
export function createPublicClient() {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
