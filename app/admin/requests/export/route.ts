import { exportRequests } from "@/lib/community/requests-export";

export const dynamic = "force-dynamic";

// Minimal CSV of the requests inbox (super admin only; authorised and audited inside exportRequests).
export async function GET(request: Request): Promise<Response> {
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  return exportRequests(sp);
}
