import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Edge middleware (the Node-runtime `proxy.ts` is not supported by OpenNext on Cloudflare).
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// The Razorpay webhook and the cron endpoint carry no session and must stay cheap: no session refresh there.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest|api/payments/webhook|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
