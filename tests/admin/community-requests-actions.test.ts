import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/admin/auth";
import { updateRequest } from "@/lib/community/requests-actions";
import { parseInboxRows, parseRequestFilters, filterQuery } from "@/lib/community/requests";
import { fakeDb, wrote, type Res } from "./fake-db";

const ID = "44444444-4444-4444-8444-444444444444";

function asSuper(script: Record<string, Res | Res[]> = { "community_requests.update": { data: [{ id: ID }], error: null } }) {
  const { db, calls } = fakeDb(script);
  vi.mocked(authorize).mockResolvedValue({ ok: true, ctx: { userId: "me", isSuper: true, societyIds: [] }, db: db as never, societyId: null });
  return calls;
}

beforeEach(() => vi.clearAllMocks());

describe("updateRequest", () => {
  it("non-super (society admin, user, signed out) is forbidden with zero DB calls", async () => {
    const { calls } = (() => {
      const f = fakeDb();
      vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "x" } });
      return f;
    })();
    expect(await updateRequest({ id: ID, status: "resolved", note: "" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(authorize).toHaveBeenCalledWith({ kind: "super" });
    expect(calls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads with zero calls", async () => {
    const calls = asSuper();
    for (const bad of [null, {}, { id: "nope", status: "new", note: "" }, { id: ID, status: "deleted", note: "" }, { id: ID, status: "new", note: "x".repeat(1001) },
      { id: ID, status: "new", note: "", extra: 1 }, { id: ID, status: "new" }]) {
      expect(await updateRequest(bad)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(calls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("updates exactly status and admin_note, then revalidates", async () => {
    const calls = asSuper();
    expect(await updateRequest({ id: ID, status: "resolved", note: "  called them  " })).toEqual({ ok: true, data: undefined });
    const u = wrote(calls, "community_requests", "update");
    expect(u).toHaveLength(1);
    expect(Object.keys(u[0].args[0] as object).sort()).toEqual(["admin_note", "status"]);
    expect(u[0].args[0]).toEqual({ status: "resolved", admin_note: "called them" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/requests");
  });

  it("unknown row -> not_found, db error -> mapped, neither revalidates", async () => {
    asSuper({ "community_requests.update": { data: [], error: null } });
    expect(await updateRequest({ id: ID, status: "new", note: "" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    asSuper({ "community_requests.update": { data: null, error: { message: "permission denied", code: "42501" } } });
    expect(await updateRequest({ id: ID, status: "new", note: "" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("filters", () => {
  it("page mode drops invalid values; strict mode rejects them", () => {
    const loose = parseRequestFilters({ kind: "bogus", status: "new", from: "2027-02-31", page: "-3" });
    expect(loose).toMatchObject({ ok: true, filters: { kind: null, status: "new", from: null, page: 1 } });
    expect(parseRequestFilters({ kind: "bogus" }, true)).toEqual({ ok: false });
    expect(parseRequestFilters({ from: "2027-02-31" }, true)).toEqual({ ok: false });
    const good = parseRequestFilters({ kind: "partner", from: "2027-03-01", to: "2027-03-02" }, true);
    expect(good.ok && good.filters.from).toBe("2027-02-28T18:30:00.000Z");
    expect(good.ok && good.filters.to).toBe("2027-03-02T18:30:00.000Z");
  });
  it("filterQuery keeps only valid filters", () => {
    expect(filterQuery({ kind: "feedback", status: "zzz", from: "2027-03-01", evil: "<x>" })).toBe("kind=feedback&from=2027-03-01");
  });
});

describe("parseInboxRows", () => {
  const row = (o: object = {}) => ({
    id: ID, kind: "feedback", status: "new", is_anonymous: false, name: "Asha", email: "a@b.co", phone: null, organisation: null,
    subject: "Hello", message: "Body text here", details: { category: "other" }, admin_note: "", created_at: "2027-01-01T00:00:00Z", ...o,
  });
  it("never shows sender data on anonymous rows, whatever the database returned", () => {
    const [r] = parseInboxRows([row({ is_anonymous: true, name: "LEAK", email: "leak@x.in", phone: "+911234567890", organisation: "LEAKORG" })]);
    expect(r.anonymous).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/LEAK|leak@|911234567890/);
  });
  it("keeps contact data for named rows, drops malformed rows and unsafe emails", () => {
    const rows = parseInboxRows([row(), { nope: 1 }, row({ email: 'a"><b@x.in' })]);
    expect(rows).toHaveLength(2);
    expect(rows[0].email).toBe("a@b.co");
    expect(rows[1].email).toBeNull();
    expect(parseInboxRows("junk")).toEqual([]);
  });
});
