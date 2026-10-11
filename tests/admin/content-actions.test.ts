import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));
vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "k" } }));

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/admin/auth";
import { deleteEntityAction, reorderEntitiesAction, saveEntityAction, saveSocietyAction } from "@/lib/admin/content-actions";
import { saveSettingsAction, saveStatsAction } from "@/lib/admin/settings-actions";
import { fakeDb, wrote, type Res } from "./fake-db";

const RAS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ID2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SEEN = "2026-10-11T10:00:00.123456+00:00";
const DENIED = { ok: false, error: { code: "forbidden", message: "You do not have access to do that." } };

function asAdmin(db: unknown, opts: { isSuper?: boolean; societyIds?: string[] } = {}) {
  const isSuper = opts.isSuper ?? false;
  const societyIds = opts.societyIds ?? [RAS];
  vi.mocked(authorize).mockImplementation((async (scope: { kind: string; societyId?: string }) => {
    const ok = { ok: true, ctx: { userId: "u", isSuper, societyIds }, db, societyId: scope.societyId ?? null };
    if (scope.kind === "any") return ok;
    if (scope.kind === "super") return isSuper ? ok : DENIED;
    if (scope.kind === "society") return isSuper || societyIds.includes(scope.societyId ?? "") ? ok : DENIED;
    return DENIED;
  }) as never);
}

const track = { name: "Vision", description: "CV track" };
const ok = (data: unknown): Res => ({ data, error: null });

beforeEach(() => vi.clearAllMocks());

describe("saveEntityAction", () => {
  it("refuses a track of a foreign society and does not write", async () => {
    const { db, calls } = fakeDb({ "tracks.select": ok({ id: ID, society_id: CS }) });
    asAdmin(db);
    const r = await saveEntityAction({ entity: "track", id: ID, data: track, seenUpdatedAt: SEEN });
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(wrote(calls, "tracks", "update")).toHaveLength(0);
  });
  it("takes the society from the row, ignoring a client societyId, on update", async () => {
    const { db, calls } = fakeDb({
      "tracks.select": ok({ id: ID, society_id: CS }),
    });
    asAdmin(db); // RAS admin
    const r = await saveEntityAction({ entity: "track", id: ID, societyId: RAS, data: track, seenUpdatedAt: SEEN });
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(wrote(calls, "tracks", "update")).toHaveLength(0);
  });
  it("updates an own track with the optimistic check and never writes the society", async () => {
    const { db, calls } = fakeDb({
      "tracks.select": ok({ id: ID, society_id: RAS }),
      "tracks.update": ok([{ id: ID, updated_at: "2026-10-11T10:01:00+00:00" }]),
      "societies.select": ok({ slug: "ras" }),
    });
    asAdmin(db);
    const r = await saveEntityAction({ entity: "track", id: ID, data: track, seenUpdatedAt: SEEN });
    expect(r).toEqual({ ok: true, data: { id: ID, updatedAt: "2026-10-11T10:01:00+00:00" } });
    const [upd] = wrote(calls, "tracks", "update");
    expect(upd.args[0]).toEqual({ name: "Vision", description: "CV track" });
    expect(calls.filter((c) => c.table === "tracks" && c.op === "eq").map((c) => c.args)).toContainEqual(["updated_at", SEEN]);
    expect(revalidatePath).toHaveBeenCalledWith("/s/ras");
  });
  it("a stale seenUpdatedAt is a conflict", async () => {
    const { db } = fakeDb({ "tracks.select": ok({ id: ID, society_id: RAS }), "tracks.update": ok([]) });
    asAdmin(db);
    const r = await saveEntityAction({ entity: "track", id: ID, data: track, seenUpdatedAt: SEEN });
    expect(r).toMatchObject({ ok: false, error: { code: "conflict" } });
  });
  it("an update without seenUpdatedAt is rejected", async () => {
    const { db } = fakeDb({ "tracks.select": ok({ id: ID, society_id: RAS }) });
    asAdmin(db);
    expect(await saveEntityAction({ entity: "track", id: ID, data: track })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });
  it("a society admin cannot create a shared speaker (no society)", async () => {
    const { db, calls } = fakeDb();
    asAdmin(db);
    const speaker = { slug: "asha", name: "Asha", designation: "", organization: "", photoUrl: null, bio: "", topic: "", links: { linkedin: "", github: "", x: "", instagram: "", website: "" } };
    const r = await saveEntityAction({ entity: "speaker", data: speaker });
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(wrote(calls, "speakers", "insert")).toHaveLength(0);
  });
  it("a society admin cannot touch sponsors or FAQs", async () => {
    const { db, calls } = fakeDb({ "faqs.select": ok({ id: ID }) });
    asAdmin(db);
    expect(await saveEntityAction({ entity: "sponsor", data: { name: "S", url: "", logoUrl: null, tier: "Gold", tierSize: "lg" } }))
      .toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await saveEntityAction({ entity: "faq", id: ID, data: { question: "Why?", answer: "Because." }, seenUpdatedAt: SEEN }))
      .toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await deleteEntityAction({ entity: "faq", id: ID })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(calls.filter((c) => ["insert", "update", "delete"].includes(c.op))).toHaveLength(0);
  });
  it("a super admin creates an FAQ at the end of the list", async () => {
    const { db, calls } = fakeDb({
      "faqs.select": ok([{ sort_order: 30 }]),
      "faqs.insert": ok({ id: ID, updated_at: SEEN }),
    });
    asAdmin(db, { isSuper: true });
    const r = await saveEntityAction({ entity: "faq", data: { question: "Why?", answer: "Because." } });
    expect(r).toEqual({ ok: true, data: { id: ID, updatedAt: SEEN } });
    expect(wrote(calls, "faqs", "insert")[0].args[0]).toEqual({ question: "Why?", answer: "Because.", sort_order: 40 });
  });
  it("creates a society track with the society from an authorised societyId", async () => {
    const { db, calls } = fakeDb({
      "tracks.select": ok([]),
      "tracks.insert": ok({ id: ID, updated_at: SEEN }),
      "societies.select": ok({ slug: "ras" }),
    });
    asAdmin(db);
    const r = await saveEntityAction({ entity: "track", societyId: RAS, data: track });
    expect(r.ok).toBe(true);
    expect(wrote(calls, "tracks", "insert")[0].args[0]).toMatchObject({ society_id: RAS, sort_order: 10 });
    asAdmin(db);
    expect(await saveEntityAction({ entity: "track", societyId: CS, data: track })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
  it("rejects an image that is not an object in this project's bucket", async () => {
    const { db, calls } = fakeDb({ "gallery_items.select": [ok({ id: ID, society_id: RAS })] });
    asAdmin(db);
    const base = { caption: "", alt: "A photo", ratio: "wide", eventId: null };
    const bad = await saveEntityAction({ entity: "gallery", id: ID, data: { ...base, imageUrl: "https://evil.example/x.png" }, seenUpdatedAt: SEEN });
    expect(bad).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    const foreign = await saveEntityAction({
      entity: "gallery", id: ID, seenUpdatedAt: SEEN,
      data: { ...base, imageUrl: `https://proj.supabase.co/storage/v1/object/public/media/societies/${CS}/gallery-ab.png` },
    });
    expect(foreign).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(wrote(calls, "gallery_items", "update")).toHaveLength(0);
  });
  it("rejects an unknown entity and unknown keys before any I/O beyond the auth check", async () => {
    const { db, calls } = fakeDb();
    asAdmin(db, { isSuper: true });
    expect(await saveEntityAction({ entity: "profiles", data: {} })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await saveEntityAction({ entity: "track", societyId: RAS, data: track, table: "profiles" }))
      .toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(calls).toHaveLength(0);
  });
});

describe("reorderEntitiesAction", () => {
  it("rejects a foreign id and a partial list", async () => {
    const { db, calls } = fakeDb({ "tracks.select": ok([{ id: ID }, { id: ID2 }]) });
    asAdmin(db);
    expect(await reorderEntitiesAction({ entity: "track", societyId: RAS, orderedIds: [ID, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"] }))
      .toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await reorderEntitiesAction({ entity: "track", societyId: RAS, orderedIds: [ID] }))
      .toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(wrote(calls, "tracks", "update")).toHaveLength(0);
  });
  it("renumbers a permutation 10, 20, ...", async () => {
    const { db, calls } = fakeDb({ "tracks.select": ok([{ id: ID }, { id: ID2 }]), "tracks.update": ok([]) });
    asAdmin(db);
    const r = await reorderEntitiesAction({ entity: "track", societyId: RAS, orderedIds: [ID2, ID] });
    expect(r.ok).toBe(true);
    expect(wrote(calls, "tracks", "update").map((c) => c.args[0])).toEqual([{ sort_order: 10 }, { sort_order: 20 }]);
  });
  it("forbids another society", async () => {
    const { db } = fakeDb();
    asAdmin(db);
    expect(await reorderEntitiesAction({ entity: "gallery", societyId: CS, orderedIds: [ID] })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("saveSocietyAction", () => {
  const edit = { description: "We build.", logoUrl: null };
  it("forbids a foreign society", async () => {
    const { db, calls } = fakeDb();
    asAdmin(db);
    expect(await saveSocietyAction({ societyId: CS, data: edit, seenUpdatedAt: SEEN })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(wrote(calls, "societies", "update")).toHaveLength(0);
  });
  it("a society admin cannot send identity fields (locked, no write)", async () => {
    const { db, calls } = fakeDb();
    asAdmin(db);
    const r = await saveSocietyAction({
      societyId: RAS, seenUpdatedAt: SEEN,
      data: { ...edit, identity: { name: "RAS", shortName: "RAS", color: "red", sortOrder: 10 } },
    });
    expect(r).toMatchObject({ ok: false, error: { code: "locked" } });
    expect(wrote(calls, "societies", "update")).toHaveLength(0);
  });
  it("maps the database identity guard (42501) to locked", async () => {
    const { db } = fakeDb({ "societies.update": { data: null, error: { code: "42501", message: "Only a super admin can change a society's identity fields" } } });
    asAdmin(db);
    expect(await saveSocietyAction({ societyId: RAS, data: edit, seenUpdatedAt: SEEN })).toMatchObject({ ok: false, error: { code: "locked" } });
  });
  it("saves description and logo only for a society admin", async () => {
    const { db, calls } = fakeDb({ "societies.update": ok([{ id: RAS, slug: "ras", updated_at: "t" }]) });
    asAdmin(db);
    const r = await saveSocietyAction({ societyId: RAS, data: edit, seenUpdatedAt: SEEN });
    expect(r).toEqual({ ok: true, data: { updatedAt: "t" } });
    expect(wrote(calls, "societies", "update")[0].args[0]).toEqual({ description: "We build.", logo_url: null });
    expect(revalidatePath).toHaveBeenCalledWith("/s/ras");
  });
  it("a super admin may include identity fields", async () => {
    const { db, calls } = fakeDb({ "societies.update": ok([{ id: RAS, slug: "ras", updated_at: "t" }]) });
    asAdmin(db, { isSuper: true });
    const r = await saveSocietyAction({
      societyId: RAS, seenUpdatedAt: SEEN,
      data: { ...edit, identity: { name: "Robotics", shortName: "RAS", color: "green", sortOrder: 20 } },
    });
    expect(r.ok).toBe(true);
    expect(wrote(calls, "societies", "update")[0].args[0]).toMatchObject({ name: "Robotics", color: "green", sort_order: 20 });
  });
  it("a stale token is a conflict", async () => {
    const { db } = fakeDb({ "societies.update": ok([]) });
    asAdmin(db);
    expect(await saveSocietyAction({ societyId: RAS, data: edit, seenUpdatedAt: SEEN })).toMatchObject({ ok: false, error: { code: "conflict" } });
  });
});

describe("settings actions", () => {
  const current = {
    name: "st(AI)rway", tagline: "Old", supportLine: "", altTaglines: [], description: "", siteUrl: "https://stairway.example",
    organizer: { name: "O", short: "O", url: "" },
    venue: { name: "V", hall: "", address: "", city: "", region: "", country: "", postalCode: "", mapEmbed: "", mapLink: "" },
    registration: { mode: "onsite", googleFormUrl: "" }, newsletter: { endpoint: "" }, gaId: "G-ABC123",
    announcement: { enabled: false, text: "" }, aftermovieUrl: "", sponsorDeckUrl: "", speakerFormUrl: "", volunteerFormUrl: "",
    contact: { email: "", sponsorEmail: "", coordinators: [] },
    social: { instagram: "", linkedin: "", whatsapp: "", youtube: "", github: "" }, ieee: { joinUrl: "", branchUrl: "" },
  };
  const block = ok({ data: current, updated_at: SEEN });

  it("is super-admin only", async () => {
    const { db, calls } = fakeDb({ "site_blocks.select": block });
    asAdmin(db);
    expect(await saveSettingsAction({ patch: { tagline: "x" }, seenUpdatedAt: SEEN })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await saveStatsAction({ items: [], seenUpdatedAt: SEEN })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(calls).toHaveLength(0);
  });
  it("ignores siteUrl, gaId, name, venue and friends even in a crafted payload", async () => {
    const { db, calls } = fakeDb({ "site_blocks.select": block, "site_blocks.update": ok([{ updated_at: "t2" }]) });
    asAdmin(db, { isSuper: true });
    const r = await saveSettingsAction({
      seenUpdatedAt: SEEN,
      patch: {
        tagline: "New tagline", siteUrl: "https://evil.example", gaId: "G-EVIL", name: "Hacked",
        venue: { name: "Evil" }, registration: { mode: "external", googleFormUrl: "https://evil.example" }, newsletter: { endpoint: "https://evil" },
      },
    });
    expect(r).toEqual({ ok: true, data: { updatedAt: "t2" } });
    const written = wrote(calls, "site_blocks", "update")[0].args[0] as { data: Record<string, unknown> };
    expect(written.data.tagline).toBe("New tagline");
    for (const k of ["siteUrl", "gaId", "name", "venue", "registration", "newsletter"]) {
      expect(written.data[k], k).toEqual((current as Record<string, unknown>)[k]);
    }
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
  it("a stale seenUpdatedAt is a conflict and writes nothing", async () => {
    const { db, calls } = fakeDb({ "site_blocks.select": ok({ data: current, updated_at: "2026-10-11T11:00:00+00:00" }) });
    asAdmin(db, { isSuper: true });
    expect(await saveSettingsAction({ patch: { tagline: "x" }, seenUpdatedAt: SEEN })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(wrote(calls, "site_blocks", "update")).toHaveLength(0);
  });
  it("a patch with only forbidden keys has nothing to save", async () => {
    const { db, calls } = fakeDb({ "site_blocks.select": block });
    asAdmin(db, { isSuper: true });
    expect(await saveSettingsAction({ patch: { siteUrl: "https://x.y" }, seenUpdatedAt: SEEN })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(wrote(calls, "site_blocks", "update")).toHaveLength(0);
  });
  it("rejects an unsafe link in the patch", async () => {
    const { db } = fakeDb({ "site_blocks.select": block });
    asAdmin(db, { isSuper: true });
    const r = await saveSettingsAction({ patch: { aftermovieUrl: "javascript:alert(1)" }, seenUpdatedAt: SEEN });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });
  it("saves stats and rejects a bad number", async () => {
    const { db, calls } = fakeDb({ "site_blocks.select": ok({ updated_at: SEEN }), "site_blocks.update": ok([{ updated_at: "t3" }]) });
    asAdmin(db, { isSuper: true });
    expect(await saveStatsAction({ items: [{ label: "Members", value: 120, suffix: "+" }], seenUpdatedAt: SEEN })).toEqual({ ok: true, data: { updatedAt: "t3" } });
    expect(wrote(calls, "site_blocks", "update")[0].args[0]).toEqual({ data: { items: [{ label: "Members", value: 120, suffix: "+" }] } });
    expect(await saveStatsAction({ items: [{ label: "Members", value: -4, suffix: "" }], seenUpdatedAt: SEEN }))
      .toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });
});
