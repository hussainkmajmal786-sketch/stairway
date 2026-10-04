import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

/** Per-request client bound to the user's session cookies (RLS as the signed-in user). */
export async function createClient() {
  const store = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The browser
          // client refreshes the session instead (no proxy on OpenNext).
        }
      },
    },
  });
}
