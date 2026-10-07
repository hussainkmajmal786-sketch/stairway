import { NextResponse, type NextRequest } from "next/server";
import { getSiteData } from "@/lib/site/load";
import { legacyRegisterTarget } from "@/lib/registration/legacy";

// The old all-in-one demo form is gone: registration now happens per session at /events/<slug>/register.
// Old links (/register, /register?step=<slug>) keep working through this redirect. It is a temporary (307)
// redirect on purpose: the target follows the calendar (the next open session), so browsers must not cache it.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const { settings, events } = await getSiteData();
  const target = legacyRegisterTarget({
    step: url.searchParams.get("step"),
    events,
    registration: settings.registration,
    now: Date.now(),
  });
  const res = NextResponse.redirect(new URL(target, url.origin), 307);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
