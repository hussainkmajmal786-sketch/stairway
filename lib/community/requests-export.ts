import "server-only";
import { authorize } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { REQUESTS_EXPORT_MAX, parseRequestFilters, requestsCsv } from "./requests";

const PAGE = 500;
const NO_BODY = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Super-admin CSV of the requests inbox: id, kind, status, created_at, organisation, subject. No contact data, no
 * message, no note. Signed out -> 401, anyone else not a super admin -> 404, bad filters -> 400. The audit entry
 * (a row count only) is written BEFORE the data leaves; if it fails nothing is served.
 */
export async function exportRequests(sp: Record<string, unknown>): Promise<Response> {
  const session = await createClient();
  const { data: claims } = await session.auth.getClaims();
  if (!claims?.claims?.sub) return NO_BODY(401);
  const auth = await authorize({ kind: "super" }, session);
  if (!auth.ok) return NO_BODY(404);
  const parsed = parseRequestFilters(sp, true);
  if (!parsed.ok) return NO_BODY(400);
  const f = parsed.filters;
  const db = auth.db;

  const rows: { id: string; kind: string; status: string; created_at: string; organisation: string | null; subject: string }[] = [];
  for (let start = 0; start < REQUESTS_EXPORT_MAX; start += PAGE) {
    let q = db.from("community_requests").select("id, kind, status, created_at, organisation, subject");
    if (f.kind) q = q.eq("kind", f.kind);
    if (f.status) q = q.eq("status", f.status);
    if (f.from) q = q.gte("created_at", f.from);
    if (f.to) q = q.lt("created_at", f.to);
    const { data, error } = await q.order("created_at", { ascending: false }).range(start, start + PAGE - 1);
    if (error || !Array.isArray(data)) return NO_BODY(503);
    rows.push(...(data as typeof rows));
    if (data.length < PAGE) break;
  }
  const exported = rows.slice(0, REQUESTS_EXPORT_MAX);

  const audit = await db.rpc("log_admin_event", {
    p_action: "requests.export",
    p_target_type: "community_requests",
    p_target_id: null as unknown as string,
    p_society_id: null as unknown as string,
    p_summary: { rows: exported.length },
  });
  if (audit.error) return NO_BODY(503);

  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" });
  return new Response("﻿" + requestsCsv(exported), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="requests-${day}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
