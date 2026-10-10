import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

export type AdminClient = SupabaseClient<Database>;

/**
 * Service-role client (bypasses RLS). Only for: confirming a verified payment, the Razorpay webhook, refunds and the
 * cron tick. It may only call the service_role RPCs (attach_payment_order, confirm_payment, expire_holds,
 * claim_refund, mark_refunded, claim_sync_batch, complete_sync); never use it for anything a signed-in user's own
 * client can do. Build one per request from `paymentsConfig()` / `syncConfig()` and never cache it at module level
 * (a Worker isolate serves many requests). No session is stored or refreshed.
 */
export function createAdminClient(serviceRoleKey: string): AdminClient {
  return createClient<Database>(publicEnv.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
