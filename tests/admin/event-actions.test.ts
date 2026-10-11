import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/admin/auth";
import {
  cancelEventAction, createEventAction, deleteDraftEventAction, duplicateEventAction, setEventStatusAction, updateEventAction,
} from "@/lib/admin/event-actions";

const RAS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SEEN = "2026-10-11T10:00:00.123456+00:00";

const fields = {
  trackId: null, step: 4, slug: "intro-to-rag", title: "Intro to RAG", topic: "Retrieval", summary: "", description: "",
  startsAt: "2030-11-14T10:00:00+05:30", endsAt: "2030-11-14T13:00:00+05:30", venue: "Hall", mode: "offline",
  level: "All levels", formats: [], capacity: 60, pricePaise: 0, ticketType: "qr", tokenPrefix: "",
  registrationOpensAt: null, registrationClosesAt: null, isFinale: false,
};

type Res = { data: unknown; error: unknown };
interface Call { table?: string; op: string; args: unknown[] }

/** Records every table op and rpc; `script` supplies results per "table.op" (arrays are consumed in order). */
function fakeDb(script: Record<string, Res | Res[]> = {}) {
  const calls: Call[] = [];
  const next = (key: string): Res => {
    const s = script[key];
    if (Array.isArray(s)) return s.length > 1 ? (s.shift() as Res) : s[0];
    return s ?? { data: [], error: null };
  };
  const from = (table: string) => {
    let op = "select";
    const b: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      if (["insert", "update", "delete", "select"].includes(name) && !(name === "select" && op !== "select")) {
        if (name !== "select") op = name;
      }
      calls.push({ table, op: name, args });
      return b;
    };
    for (const m of ["select", "insert", "update", "delete", "eq", "order", "limit", "in"]) b[m] = chain(m);
    const settle = () => Promise.resolve(next(`${table}.${op}`));
    b.maybeSingle = () => settle();
    b.single = () => settle();
    b.then = (res: (v: Res) => unknown, rej: (e: unknown) => unknown) => settle().then(res, rej);
    return b;
  };
  const rpc = (name: string, args: unknown) => {
    calls.push({ op: "rpc", args: [name, args] });
    return Promise.resolve(next(`rpc.${name}`));
  };
  return { db: { from, rpc }, calls };
}

function allow(db: unknown, opts: { isSuper?: boolean; societyId?: string } = {}) {
  vi.mocked(authorize).mockResolvedValue({
    ok: true, ctx: { userId: "u", isSuper: opts.isSuper ?? false, societyIds: [RAS] }, db: db as never, societyId: opts.societyId ?? RAS,
  });
}
const deny = () =>
  vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "You do not have access to do that." } });
const wrote = (calls: Call[], table: string, op: string) => calls.filter((c) => c.table === table && c.op === op);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createEventAction", () => {
  it("authorises the society scope first and refuses a foreign society without writing", async () => {
    deny();
    const r = await createEventAction({ societyId: CS, ...fields });
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(authorize).toHaveBeenCalledWith({ kind: "society", societyId: CS });
  });
  it("inserts a draft for the authorised society", async () => {
    const { db, calls } = fakeDb({ "events.insert": { data: { id: EID }, error: null } });
    allow(db);
    const r = await createEventAction({ societyId: RAS, ...fields });
    expect(r).toEqual({ ok: true, data: { id: EID } });
    const [ins] = wrote(calls, "events", "insert");
    expect(ins.args[0]).toMatchObject({ society_id: RAS, status: "draft", slug: "intro-to-rag" });
  });
  it("does not write is_finale for a society admin", async () => {
    const { db, calls } = fakeDb({ "events.insert": { data: { id: EID }, error: null } });
    allow(db, { isSuper: false });
    await createEventAction({ societyId: RAS, ...fields, isFinale: true });
    expect(wrote(calls, "events", "insert")[0].args[0]).not.toHaveProperty("is_finale");
  });
  it("rejects invalid input after authorising, without a write", async () => {
    const { db, calls } = fakeDb();
    allow(db);
    const r = await createEventAction({ societyId: RAS, ...fields, slug: "Bad Slug" });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input", fieldErrors: { slug: expect.any(String) } } });
    expect(wrote(calls, "events", "insert")).toHaveLength(0);
  });
  it("maps a duplicate slug to conflict", async () => {
    const { db } = fakeDb({ "events.insert": { data: null, error: { code: "23505", message: "dup" } } });
    allow(db);
    expect(await createEventAction({ societyId: RAS, ...fields })).toMatchObject({ ok: false, error: { code: "conflict" } });
  });
});

describe("updateEventAction", () => {
  const input = { id: EID, seenUpdatedAt: SEEN, ...fields };
  it("a foreign-society event is forbidden with no update call", async () => {
    deny();
    const r = await updateEventAction(input);
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(authorize).toHaveBeenCalledWith({ kind: "event", eventId: EID });
  });
  it("ignores a societyId in the payload and filters by id + seen updated_at", async () => {
    const { db, calls } = fakeDb({
      "events.update": { data: [{ id: EID, slug: "intro-to-rag", status: "draft", society_id: RAS, updated_at: "2026-10-11T10:05:00+00:00" }], error: null },
    });
    allow(db);
    const r = await updateEventAction({ ...input, societyId: CS });
    expect(r).toEqual({ ok: true, data: { updatedAt: "2026-10-11T10:05:00+00:00" } });
    const [upd] = wrote(calls, "events", "update");
    expect(upd.args[0]).not.toHaveProperty("society_id");
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([["id", EID], ["updated_at", SEEN]]);
  });
  it("strips isFinale for non-super admins and keeps it for super admins", async () => {
    const row = { id: EID, slug: "x", status: "draft", society_id: RAS, updated_at: SEEN };
    const a = fakeDb({ "events.update": { data: [row], error: null } });
    allow(a.db, { isSuper: false });
    await updateEventAction({ ...input, isFinale: true });
    expect(wrote(a.calls, "events", "update")[0].args[0]).not.toHaveProperty("is_finale");
    const b = fakeDb({ "events.update": { data: [row], error: null } });
    allow(b.db, { isSuper: true });
    await updateEventAction({ ...input, isFinale: true });
    expect(wrote(b.calls, "events", "update")[0].args[0]).toMatchObject({ is_finale: true });
  });
  it("zero rows (stale token) is a conflict, never success", async () => {
    const { db } = fakeDb({ "events.update": { data: [], error: null } });
    allow(db);
    expect(await updateEventAction(input)).toMatchObject({ ok: false, error: { code: "conflict" } });
  });
  it("maps database guard errors", async () => {
    const { db } = fakeDb({ "events.update": { data: null, error: { code: "P0001", message: "price_locked" } } });
    allow(db);
    expect(await updateEventAction(input)).toMatchObject({ ok: false, error: { code: "locked" } });
  });
  it("rejects unknown keys", async () => {
    const { db, calls } = fakeDb();
    allow(db);
    const r = await updateEventAction({ ...input, status: "published" });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(wrote(calls, "events", "update")).toHaveLength(0);
  });
});

describe("setEventStatusAction", () => {
  const storedOk = { title: "Intro", topic: "RAG", venue: "Hall", mode: "offline", capacity: 10, starts_at: "2099-01-01T00:00:00+00:00", ticket_type: "qr", token_prefix: "" };
  it("publishes when the STORED row passes the gate", async () => {
    const { db, calls } = fakeDb({
      "events.select": { data: storedOk, error: null },
      "events.update": { data: [{ id: EID, slug: "intro", society_id: RAS, updated_at: SEEN }], error: null },
    });
    allow(db);
    const r = await setEventStatusAction({ id: EID, status: "published", seenUpdatedAt: SEEN });
    expect(r.ok).toBe(true);
    expect(wrote(calls, "events", "update")[0].args[0]).toEqual({ status: "published" });
    expect(revalidatePath).toHaveBeenCalledWith("/events/intro");
  });
  it("blocks publishing with the blocker list and never updates", async () => {
    const { db, calls } = fakeDb({ "events.select": { data: { ...storedOk, topic: "", capacity: 0 }, error: null } });
    allow(db);
    const r = await setEventStatusAction({ id: EID, status: "published", seenUpdatedAt: SEEN });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(wrote(calls, "events", "update")).toHaveLength(0);
  });
  it("surfaces has_registrations when unpublishing", async () => {
    const { db } = fakeDb({ "events.update": { data: null, error: { code: "P0001", message: "has_registrations" } } });
    allow(db);
    const r = await setEventStatusAction({ id: EID, status: "draft", seenUpdatedAt: SEEN });
    expect(r).toMatchObject({ ok: false, error: { code: "locked" } });
  });
  it("rejects statuses other than published/draft (cancel has its own action)", async () => {
    const { db } = fakeDb();
    allow(db);
    const r = await setEventStatusAction({ id: EID, status: "cancelled", seenUpdatedAt: SEEN });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });
});

describe("cancelEventAction", () => {
  const stored = { title: "Intro to RAG", slug: "intro", society_id: RAS };
  it("a wrong confirmTitle is invalid_input and calls no rpc", async () => {
    const { db, calls } = fakeDb({ "events.select": { data: stored, error: null } });
    allow(db);
    const r = await cancelEventAction({ id: EID, confirmTitle: "intro to rag" });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(calls.filter((c) => c.op === "rpc")).toHaveLength(0);
  });
  it("cancels through the RPC exactly once and never with a plain update", async () => {
    const { db, calls } = fakeDb({
      "events.select": { data: stored, error: null },
      "rpc.admin_cancel_event": { data: { cancelled: 12, refund_needed: 5, waitlisted: 2 }, error: null },
    });
    allow(db);
    const r = await cancelEventAction({ id: EID, confirmTitle: "Intro to RAG" });
    expect(r).toEqual({ ok: true, data: { cancelled: 12, refundNeeded: 5, waitlisted: 2 } });
    const rpcs = calls.filter((c) => c.op === "rpc");
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].args).toEqual(["admin_cancel_event", { p_event_id: EID }]);
    expect(wrote(calls, "events", "update")).toHaveLength(0);
  });
});

describe("duplicateEventAction", () => {
  const src = {
    id: EID, society_id: RAS, track_id: null, step_number: 3, slug: "intro", title: "Intro", topic: "T", summary: "", description: "",
    starts_at: "2030-01-01T00:00:00+00:00", ends_at: "2030-01-01T02:00:00+00:00", venue: "Hall", mode: "offline", poster_url: null,
    video_url: null, level: "All levels", formats: [], agenda: [], outcomes: [], prerequisites: [], bring: [], capacity: 10,
    price_paise: 0, ticket_type: "qr", token_prefix: "", questions: [], status: "published", is_finale: true,
    registration_opens_at: "2030-01-01T00:00:00+00:00", registration_closes_at: "2030-01-01T00:00:00+00:00",
  };
  it("foreign society is forbidden", async () => {
    deny();
    expect(await duplicateEventAction(EID)).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
  it("inserts a draft copy with a cleared window and the next step, then copies speakers", async () => {
    const { db, calls } = fakeDb({
      "events.select": [{ data: src, error: null }, { data: [{ step_number: 3 }, { step_number: 7 }], error: null }],
      "events.insert": { data: { id: "new-id" }, error: null },
      "event_speakers.select": { data: [{ speaker_id: "s1", sort_order: 0 }], error: null },
      "event_speakers.insert": { data: null, error: null },
    });
    allow(db, { isSuper: false });
    const r = await duplicateEventAction(EID);
    expect(r).toEqual({ ok: true, data: { id: "new-id" } });
    const ins = wrote(calls, "events", "insert")[0].args[0] as Record<string, unknown>;
    expect(ins).toMatchObject({
      status: "draft", title: "Intro (copy)", slug: "intro-copy", step_number: 8, registration_opens_at: null,
      registration_closes_at: null, is_finale: false, society_id: RAS,
    });
    expect(wrote(calls, "event_speakers", "insert")).toHaveLength(1);
  });
  it("retries the slug on a unique violation, then reports a conflict", async () => {
    const { db, calls } = fakeDb({
      "events.select": [{ data: src, error: null }, { data: [{ step_number: 3 }], error: null }],
      "events.insert": { data: null, error: { code: "23505", message: "dup" } },
    });
    allow(db);
    const r = await duplicateEventAction(EID);
    expect(r).toMatchObject({ ok: false, error: { code: "conflict" } });
    const slugs = wrote(calls, "events", "insert").map((c) => (c.args[0] as { slug: string }).slug);
    expect(slugs).toEqual(["intro-copy", "intro-copy-2", "intro-copy-3", "intro-copy-4", "intro-copy-5"]);
  });
});

describe("deleteDraftEventAction", () => {
  it("only deletes drafts and reports a registration lock", async () => {
    const { db, calls } = fakeDb({ "events.delete": { data: null, error: { code: "23503", message: "fk" } } });
    allow(db);
    expect(await deleteDraftEventAction(EID)).toMatchObject({ ok: false, error: { code: "locked" } });
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toContainEqual(["status", "draft"]);
  });
  it("zero rows (not a draft) is locked", async () => {
    const { db } = fakeDb({ "events.delete": { data: [], error: null } });
    allow(db);
    expect(await deleteDraftEventAction(EID)).toMatchObject({ ok: false, error: { code: "locked" } });
  });
  it("deletes a draft", async () => {
    const { db } = fakeDb({ "events.delete": { data: [{ id: EID }], error: null } });
    allow(db);
    expect(await deleteDraftEventAction(EID)).toEqual({ ok: true, data: undefined });
  });
});
