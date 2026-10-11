import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));

import { authorize } from "@/lib/admin/auth";
import { exportRegistrations, registrantsCsv } from "@/lib/admin/export";
import { fakeDb, rpcCalls } from "./fake-db";

const EID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = (i: number) => ({
  registration_id: `r${i}`, status: "confirmed", token_number: i, checked_in_at: null, created_at: "2030-01-01T00:00:00Z",
  amount_paise: 19900, receipt_number: "RCPT-1", razorpay_payment_id: "pay_SECRET1234567", full_name: `Person ${i}`,
  email: `p${i}@x.in`, phone: "+919800000000", college: "CIT", branch: "CSE", year: 3, answers: { q1: "=HYPERLINK(1)" },
});
const QUESTIONS = [{ id: "q1", type: "text", label: "Why?", required: false }];
const allow = (db: unknown, isSuper = false) =>
  vi.mocked(authorize).mockResolvedValue({ ok: true, ctx: { userId: "u", isSuper, societyIds: [SID] }, db: db as never, societyId: SID });

beforeEach(() => vi.clearAllMocks());

describe("exportRegistrations", () => {
  it("is an empty 404 when unauthorised", async () => {
    vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "x" } });
    const res = await exportRegistrations(EID, false);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });
  it("serves a minimal CSV with safe headers and an audit row", async () => {
    const { db, calls } = fakeDb({
      "events.select": { data: { slug: "intro-rag", token_prefix: "RAS", questions: QUESTIONS }, error: null },
      "rpc.admin_event_registrants": { data: { total: 1, rows: [row(1)] }, error: null },
      "rpc.log_admin_event": { data: null, error: null },
    });
    allow(db, false);
    const res = await exportRegistrations(EID, false);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="intro-rag-registrations.csv"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    const [header, line] = text.slice(1).split("\r\n");
    expect(header).toBe("token,full_name,email,phone,college,branch,year,status,checked_in,registered_at");
    expect(line.startsWith("RAS-0001,Person 1,p1@x.in,'+919800000000")).toBe(true);
    expect(text).not.toMatch(/pay_|RCPT|HYPERLINK/);
    expect(rpcCalls(calls, "log_admin_event")[0].args[1]).toEqual({
      p_action: "registrations.export", p_target_type: "event", p_target_id: EID, p_society_id: SID,
      p_summary: { rows: 1, answers: false },
    });
  });
  it("adds amount and receipt for super admins only, never payment ids", async () => {
    const { db } = fakeDb({
      "events.select": { data: { slug: "s", token_prefix: "", questions: [] }, error: null },
      "rpc.admin_event_registrants": { data: { total: 1, rows: [row(2)] }, error: null },
      "rpc.log_admin_event": { data: null, error: null },
    });
    allow(db, true);
    const text = await (await exportRegistrations(EID, false)).text();
    expect(text).toContain("amount_inr,receipt_number");
    expect(text).toContain(",199,RCPT-1");
    expect(text).not.toContain("pay_SECRET");
  });
  it("answers=1 adds one column per question and neutralises formulas", async () => {
    const { db } = fakeDb({
      "events.select": { data: { slug: "s", token_prefix: "", questions: QUESTIONS }, error: null },
      "rpc.admin_event_registrants": { data: { total: 1, rows: [row(3)] }, error: null },
      "rpc.log_admin_event": { data: null, error: null },
    });
    allow(db);
    const text = await (await exportRegistrations(EID, true)).text();
    expect(text).toContain(",registered_at,Why?\r\n");
    expect(text).toContain("'=HYPERLINK(1)");
  });
  it("caps at 2000 rows and flags truncation", async () => {
    const page = { data: { total: 2001, rows: Array.from({ length: 200 }, (_, i) => row(i + 1)) }, error: null };
    const { db, calls } = fakeDb({
      "events.select": { data: { slug: "s", token_prefix: "", questions: [] }, error: null },
      "rpc.admin_event_registrants": page,
      "rpc.log_admin_event": { data: null, error: null },
    });
    allow(db);
    const res = await exportRegistrations(EID, false);
    expect(res.headers.get("X-Export-Truncated")).toBe("1");
    expect(rpcCalls(calls, "admin_event_registrants")).toHaveLength(10);
    expect((await res.text()).split("\r\n")).toHaveLength(2000 + 2); // header + rows + trailing empty
    expect(rpcCalls(calls, "log_admin_event")[0].args[1]).toMatchObject({ p_summary: { rows: 2000, answers: false } });
  });
  it("serves nothing when the audit write fails", async () => {
    const { db } = fakeDb({
      "events.select": { data: { slug: "s", token_prefix: "", questions: [] }, error: null },
      "rpc.admin_event_registrants": { data: { total: 0, rows: [] }, error: null },
      "rpc.log_admin_event": { data: null, error: { message: "boom" } },
    });
    allow(db);
    const res = await exportRegistrations(EID, false);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("");
  });
});

describe("registrantsCsv", () => {
  it("renders multi-choice and checkbox answers readably", () => {
    const csv = registrantsCsv({
      rows: [{ registration_id: "r", status: "confirmed", created_at: "x", answers: { a: ["X", "Y"], b: true } }],
      tokenPrefix: "", isSuper: false, answers: true,
      questions: [
        { id: "a", type: "multi_choice", label: "A", required: false, options: ["X", "Y"] },
        { id: "b", type: "checkbox", label: "B", required: false },
      ],
    });
    expect(csv.split("\r\n")[1]).toContain("X; Y,Yes");
  });
});
