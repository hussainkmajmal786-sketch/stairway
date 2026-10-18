import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { authorize } from "@/lib/admin/auth";
import { exportRequests } from "@/lib/community/requests-export";
import { createClient } from "@/lib/supabase/server";
import { fakeDb, rpcCalls, type Res } from "./fake-db";

const row = (i: number, subject = `Subject ${i}`) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, kind: "partner", status: "new", created_at: "2027-01-01T00:00:00Z",
  organisation: "Org", subject,
  // sentinels that must never reach the file even if the database returned them
  email: "SENTINEL_EMAIL@x.in", phone: "SENTINEL_PHONE", message: "SENTINEL_MESSAGE", admin_note: "SENTINEL_NOTE", name: "SENTINEL_NAME",
});

function setup(signedIn: boolean, isSuper: boolean, script: Record<string, Res | Res[]> = {}) {
  const f = fakeDb({ "rpc.log_admin_event": { data: null, error: null }, ...script });
  const session = { auth: { getClaims: vi.fn(async () => ({ data: signedIn ? { claims: { sub: "u" } } : null, error: null })) } };
  vi.mocked(createClient).mockResolvedValue(session as never);
  vi.mocked(authorize).mockResolvedValue(
    isSuper ? { ok: true, ctx: { userId: "u", isSuper: true, societyIds: [] }, db: f.db as never, societyId: null }
      : { ok: false, error: { code: "forbidden", message: "x" } },
  );
  return f.calls;
}

beforeEach(() => vi.clearAllMocks());

describe("exportRequests", () => {
  it("signed out -> 401 body-less, no authorize", async () => {
    setup(false, false);
    const res = await exportRequests({});
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
    expect(authorize).not.toHaveBeenCalled();
  });
  it("signed in but not super -> 404 body-less with zero db calls", async () => {
    const calls = setup(true, false);
    const res = await exportRequests({});
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(calls).toHaveLength(0);
  });
  it("invalid filters -> 400 and nothing is queried or audited", async () => {
    const calls = setup(true, true);
    for (const sp of [{ kind: "bogus" }, { status: "x" }, { from: "2027-02-31" }]) expect((await exportRequests(sp)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("serves a minimal formula-safe CSV and audits a numeric summary once", async () => {
    const calls = setup(true, true, {
      "community_requests.select": { data: [row(1, "=HYPERLINK(\"http://evil\")"), row(2)], error: null },
    });
    const res = await exportRequests({ kind: "partner" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="requests-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const text = (await res.text()).replace(/^﻿/, "");
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("id,kind,status,created_at,organisation,subject");
    expect(lines[1]).toContain("'=HYPERLINK");
    expect(text).not.toMatch(/SENTINEL/);
    const audit = rpcCalls(calls, "log_admin_event");
    expect(audit).toHaveLength(1);
    expect(audit[0].args[1]).toMatchObject({ p_action: "requests.export", p_summary: { rows: 2 } });
    expect(Object.values((audit[0].args[1] as { p_summary: Record<string, unknown> }).p_summary).every((v) => typeof v === "number")).toBe(true);
    // the select list never names contact columns
    const sel = calls.filter((c) => c.op === "select").map((c) => String(c.args[0]));
    expect(sel.join(" ")).not.toMatch(/email|phone|message|admin_note|name|user_id|ip_hash/);
  });
  it("caps the export at 2000 rows", async () => {
    const page = Array.from({ length: 500 }, (_, i) => row(i + 1));
    setup(true, true, { "community_requests.select": { data: page, error: null } });
    const res = await exportRequests({});
    const lines = (await res.text()).split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1 + 2000);
  });
  it("serves nothing when the audit entry fails", async () => {
    setup(true, true, { "community_requests.select": { data: [row(1)], error: null }, "rpc.log_admin_event": { data: null, error: { message: "x" } } });
    expect((await exportRequests({})).status).toBe(503);
  });
});
