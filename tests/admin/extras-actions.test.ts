import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));
vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "k" } }));

import { authorize } from "@/lib/admin/auth";
import { attachEventMediaAction, prepareUploadAction } from "@/lib/admin/media-actions";
import {
  saveEventContentAction, saveEventQuestionsAction, saveEventResourcesAction, saveEventSpeakersAction,
} from "@/lib/admin/event-extras-actions";

const RAS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SP1 = "11111111-1111-4111-8111-111111111111";
const SP2 = "22222222-2222-4222-8222-222222222222";
const SEEN = "2026-10-11T10:00:00+00:00";
const OK_ROW = { id: EID, slug: "intro", status: "draft", society_id: RAS, updated_at: "2026-10-11T10:05:00+00:00" };

type Res = { data: unknown; error: unknown };
interface Call { table?: string; op: string; args: unknown[] }

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
    for (const m of ["select", "insert", "update", "upsert", "delete", "eq", "in", "not"]) {
      b[m] = (...args: unknown[]) => {
        if (["insert", "update", "upsert", "delete"].includes(m)) op = m;
        calls.push({ table, op: m, args });
        return b;
      };
    }
    const settle = () => Promise.resolve(next(`${table}.${op}`));
    b.maybeSingle = () => settle();
    b.then = (res: (v: Res) => unknown, rej: (e: unknown) => unknown) => settle().then(res, rej);
    return b;
  };
  const storage = {
    from: (bucket: string) => ({
      createSignedUploadUrl: (path: string) => {
        calls.push({ table: `storage.${bucket}`, op: "createSignedUploadUrl", args: [path] });
        return Promise.resolve({ data: { signedUrl: "u", token: "tok", path }, error: null });
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/media/${path}` } }),
    }),
  };
  const rpc = (name: string, args: unknown) => {
    calls.push({ op: "rpc", args: [name, args] });
    return Promise.resolve(next(`rpc.${name}`));
  };
  return { db: { from, rpc, storage }, calls };
}
function allow(db: unknown, societyId: string | null = RAS, isSuper = false) {
  vi.mocked(authorize).mockResolvedValue({ ok: true, ctx: { userId: "u", isSuper, societyIds: [RAS] }, db: db as never, societyId });
}
const deny = () => vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "no" } });
const has = (calls: Call[], table: string, op: string) => calls.some((c) => c.table === table && c.op === op);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prepareUploadAction", () => {
  it("authorises the event scope and builds the path from the row's society", async () => {
    const { db, calls } = fakeDb();
    allow(db, RAS);
    const r = await prepareUploadAction({ target: { eventId: EID }, kind: "poster", mime: "image/jpeg", size: 1000 });
    expect(authorize).toHaveBeenCalledWith({ kind: "event", eventId: EID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.path).toMatch(new RegExp(`^societies/${RAS}/events/${EID}/poster-[0-9a-f]{32}\\.jpg$`));
    expect(r.data.token).toBe("tok");
    expect(r.data.publicUrl).toContain(r.data.path);
    const log = calls.find((c) => c.op === "rpc");
    expect(log?.args[0]).toBe("log_admin_event");
    // audit summaries hold numbers only
    expect(Object.values((log?.args[1] as { p_summary: Record<string, unknown> }).p_summary).every((v) => typeof v === "number")).toBe(true);
  });
  it("a foreign-society event is forbidden with no storage call", async () => {
    const { db, calls } = fakeDb();
    deny();
    const r = await prepareUploadAction({ target: { eventId: EID }, kind: "poster", mime: "image/jpeg", size: 1000 });
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(calls).toHaveLength(0);
    void db;
  });
  it("site uploads need the super scope", async () => {
    deny();
    await prepareUploadAction({ target: { site: true }, kind: "sponsor", mime: "image/png", size: 10 });
    expect(authorize).toHaveBeenCalledWith({ kind: "super" });
  });
  it("rejects svg, html, oversize and wrong-kind uploads before any storage call", async () => {
    const { db, calls } = fakeDb();
    allow(db);
    for (const input of [
      { target: { eventId: EID }, kind: "poster", mime: "image/svg+xml", size: 100 },
      { target: { eventId: EID }, kind: "poster", mime: "text/html", size: 100 },
      { target: { eventId: EID }, kind: "poster", mime: "image/png", size: 5 * 1024 * 1024 + 1 },
      { target: { eventId: EID }, kind: "sponsor", mime: "image/png", size: 100 },
      { target: { eventId: EID }, kind: "poster", mime: "image/png", size: 100, extra: 1 },
    ]) {
      const r = await prepareUploadAction(input);
      expect(r.ok).toBe(false);
    }
    expect(has(calls, "storage.media", "createSignedUploadUrl")).toBe(false);
    expect(calls.some((c) => c.op === "rpc")).toBe(false);
  });
});

describe("attachEventMediaAction", () => {
  const base = { eventId: EID, seenUpdatedAt: SEEN };
  const own = `https://proj.supabase.co/storage/v1/object/public/media/societies/${RAS}/events/${EID}/poster-${"a".repeat(32)}.jpg`;
  it("stores an own-folder poster URL with the optimistic check", async () => {
    const { db, calls } = fakeDb({ "events.update": { data: [OK_ROW], error: null } });
    allow(db);
    const r = await attachEventMediaAction({ ...base, field: "poster", url: own });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.op === "update")?.args[0]).toEqual({ poster_url: own });
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([["id", EID], ["updated_at", SEEN]]);
  });
  it("rejects a poster outside the event folder", async () => {
    const { db, calls } = fakeDb();
    allow(db);
    const other = `https://proj.supabase.co/storage/v1/object/public/media/societies/${CS}/events/${EID}/poster-x.jpg`;
    for (const url of [other, "https://evil.example/p.jpg", own.replace("https:", "http:")]) {
      expect(await attachEventMediaAction({ ...base, field: "poster", url })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(has(calls, "events", "update")).toBe(false);
  });
  it("normalises a YouTube link and refuses unsafe ones", async () => {
    const { db, calls } = fakeDb({ "events.update": { data: [OK_ROW], error: null } });
    allow(db);
    const ok = await attachEventMediaAction({ ...base, field: "video", url: "https://youtu.be/dQw4w9WgXcQ?t=5" });
    expect(ok.ok && ok.data.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const bad = await attachEventMediaAction({ ...base, field: "video", url: "javascript:alert(1)" });
    expect(bad).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(1);
  });
  it("clears with an empty url and reports a stale token as conflict", async () => {
    const a = fakeDb({ "events.update": { data: [OK_ROW], error: null } });
    allow(a.db);
    const cleared = await attachEventMediaAction({ ...base, field: "video", url: "" });
    expect(cleared.ok && cleared.data.url).toBeNull();
    const b = fakeDb({ "events.update": { data: [], error: null } });
    allow(b.db);
    expect(await attachEventMediaAction({ ...base, field: "video", url: "" })).toMatchObject({ ok: false, error: { code: "conflict" } });
  });
  it("a foreign-society event is forbidden", async () => {
    deny();
    expect(await attachEventMediaAction({ ...base, field: "video", url: "" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("saveEventSpeakersAction", () => {
  it("rejects a speaker of another society before any write", async () => {
    const { db, calls } = fakeDb({ "speakers.select": { data: [{ id: SP1, society_id: RAS }, { id: SP2, society_id: CS }], error: null } });
    allow(db, RAS);
    const r = await saveEventSpeakersAction({ id: EID, speakerIds: [SP1, SP2] });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(has(calls, "event_speakers", "upsert")).toBe(false);
    expect(has(calls, "event_speakers", "delete")).toBe(false);
  });
  it("upserts the wanted set, then deletes the rest, then audits with numbers only", async () => {
    const { db, calls } = fakeDb({ "speakers.select": { data: [{ id: SP1, society_id: RAS }, { id: SP2, society_id: null }], error: null } });
    allow(db, RAS);
    const r = await saveEventSpeakersAction({ id: EID, speakerIds: [SP1, SP2] });
    expect(r).toEqual({ ok: true, data: { count: 2 } });
    const order = calls.filter((c) => c.table === "event_speakers" && ["upsert", "delete"].includes(c.op)).map((c) => c.op);
    expect(order).toEqual(["upsert", "delete"]);
    const log = calls.find((c) => c.op === "rpc");
    expect(log?.args[1]).toMatchObject({ p_action: "event.speakers", p_summary: { count: 2 } });
  });
  it("a foreign-society event is forbidden", async () => {
    deny();
    expect(await saveEventSpeakersAction({ id: EID, speakerIds: [] })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("saveEventQuestionsAction", () => {
  const good = [{ id: "team", label: "Team name", type: "text", required: true }];
  it("saves a valid question set", async () => {
    const { db, calls } = fakeDb({ "events.update": { data: [OK_ROW], error: null }, "registrations.select": { data: null, error: null } });
    allow(db);
    const r = await saveEventQuestionsAction({ id: EID, seenUpdatedAt: SEEN, questions: good });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.op === "update")?.args[0]).toEqual({ questions: good });
  });
  it("rejects an invalid set without an update", async () => {
    const { db, calls } = fakeDb();
    allow(db);
    const r = await saveEventQuestionsAction({ id: EID, seenUpdatedAt: SEEN, questions: [{ id: "Bad Id", label: "", type: "text", required: true }] });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input", message: "These questions are not valid." } });
    expect(has(calls, "events", "update")).toBe(false);
  });
  it("maps the database CHECK to the same message", async () => {
    const { db } = fakeDb({ "events.update": { data: null, error: { code: "23514", message: "check" } } });
    allow(db);
    expect(await saveEventQuestionsAction({ id: EID, seenUpdatedAt: SEEN, questions: good })).toMatchObject({
      ok: false, error: { code: "invalid_input", message: "These questions are not valid." },
    });
  });
  it("a foreign-society event is forbidden", async () => {
    deny();
    expect(await saveEventQuestionsAction({ id: EID, seenUpdatedAt: SEEN, questions: good })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("saveEventContentAction / saveEventResourcesAction", () => {
  it("rebuilds agenda without empty details and rejects unknown keys", async () => {
    const { db, calls } = fakeDb({ "events.update": { data: [OK_ROW], error: null } });
    allow(db);
    const r = await saveEventContentAction({
      id: EID, seenUpdatedAt: SEEN, agenda: [{ time: "10:00", title: "Talk", detail: "" }], outcomes: ["a"], prerequisites: [], bring: [],
    });
    expect(r.ok).toBe(true);
    expect((calls.find((c) => c.op === "update")?.args[0] as { agenda: unknown }).agenda).toEqual([{ time: "10:00", title: "Talk" }]);
    const bad = await saveEventContentAction({
      id: EID, seenUpdatedAt: SEEN, agenda: [{ time: "10:00", title: "Talk", evil: 1 }], outcomes: [], prerequisites: [], bring: [],
    });
    expect(bad).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });
  it("enforces caps", async () => {
    const { db } = fakeDb();
    allow(db);
    const many = Array.from({ length: 31 }, (_, i) => ({ time: "1", title: `t${i}` }));
    expect((await saveEventContentAction({ id: EID, seenUpdatedAt: SEEN, agenda: many, outcomes: [], prerequisites: [], bring: [] })).ok).toBe(false);
    const long = ["x".repeat(121)];
    expect((await saveEventContentAction({ id: EID, seenUpdatedAt: SEEN, agenda: [], outcomes: long, prerequisites: [], bring: [] })).ok).toBe(false);
  });
  it("resources must be https and winners are capped", async () => {
    const { db, calls } = fakeDb({ "events.update": { data: [OK_ROW], error: null } });
    allow(db);
    const bad = await saveEventResourcesAction({ id: EID, seenUpdatedAt: SEEN, resources: { slides: "http://x.example/s.pdf" }, winners: [] });
    expect(bad).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    const js = await saveEventResourcesAction({ id: EID, seenUpdatedAt: SEEN, resources: { reading: [{ label: "x", href: "javascript:alert(1)" }] }, winners: [] });
    expect(js.ok).toBe(false);
    const ok = await saveEventResourcesAction({
      id: EID, seenUpdatedAt: SEEN, resources: { slides: "https://x.example/s.pdf", code: "" }, winners: [{ place: "1st", team: "A", project: "" }],
    });
    expect(ok.ok).toBe(true);
    expect((calls.find((c) => c.op === "update")?.args[0] as { resources: unknown }).resources).toEqual({ slides: "https://x.example/s.pdf" });
    const tooMany = Array.from({ length: 11 }, () => ({ place: "1", team: "t", project: "" }));
    expect((await saveEventResourcesAction({ id: EID, seenUpdatedAt: SEEN, resources: {}, winners: tooMany })).ok).toBe(false);
  });
});
