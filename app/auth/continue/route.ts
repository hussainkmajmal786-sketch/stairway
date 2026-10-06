import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { postSignInPath } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"), "/me");
  const supabase = await createClient();
  return NextResponse.redirect(`${origin}${await postSignInPath(supabase, next)}`);
}
