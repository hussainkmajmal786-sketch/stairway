import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";
import { hasSupabaseSessionCookie } from "@/lib/auth/cookies";

/**
 * Standard Supabase session refresh. Runs only for requests that already carry an
 * auth cookie, so anonymous visitors pay nothing. Refreshed tokens are written to
 * both the request (so server components see them) and the response.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  if (!hasSupabaseSessionCookie(request.cookies.getAll().map((c) => c.name))) {
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
