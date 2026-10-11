import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => nav);

import { createClient } from "@/lib/supabase/server";
import { authorize, getAdminContext, requireAdmin } from "@/lib/admin/auth";

const UID = "11111111-1111-4111-8111-111111111111";
const RAS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EV_RAS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EV_CS = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

interface World {
  sub?: string | null;
  roles?: { role: string; society_id: string | null }[];
  events?: Record<string, string>;
}
function fakeDb(w: World) {
  const calls: unknown[][] = [];
  const db = {
    auth: { getClaims: async () => ({ data: w.sub ? { claims: { sub: w.sub } } : null, error: null }) },
    from: (table: string) => {
      calls.push(["from", table]);
      const filters: Record<string, string> = {};
      const b = {
        select: (cols: string) => {
          calls.push(["select", table, cols]);
          return b;
        },
        eq: (col: string, val: string) => {
          calls.push(["eq", table, col, val]);
          filters[col] = val;
          return b;
        },
        maybeSingle: async () => {
          const society = w.events?.[filters.id];
          return { data: society ? { society_id: society } : null, error: null };
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: w.roles ?? [], error: null }),
      };
      return b;
    },
  };
  vi.mocked(createClient).mockResolvedValue(db as never);
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAdminContext", () => {
  it("is null without claims", async () => {
    fakeDb({ sub: null });
    expect(await getAdminContext()).toBeNull();
  });
  it("is null when the user has no role rows", async () => {
    fakeDb({ sub: UID, roles: [] });
    expect(await getAdminContext()).toBeNull();
  });
  it("filters the role query by the claim's sub", async () => {
    const calls = fakeDb({ sub: UID, roles: [{ role: "super_admin", society_id: null }] });
    const ctx = await getAdminContext();
    expect(ctx).toEqual({ userId: UID, isSuper: true, societyIds: [] });
    expect(calls).toContainEqual(["eq", "admin_roles", "user_id", UID]);
  });
});

describe("authorize", () => {
  const societyAdmin: World = {
    sub: UID,
    roles: [{ role: "society_admin", society_id: RAS }],
    events: { [EV_RAS]: RAS, [EV_CS]: CS },
  };

  it("denies without claims", async () => {
    fakeDb({ sub: null });
    expect((await authorize({ kind: "any" })).ok).toBe(false);
  });
  it("denies claims without roles", async () => {
    fakeDb({ sub: UID, roles: [] });
    const r = await authorize({ kind: "any" });
    expect(r.ok).toBe(false);
  });
  it("denies a society admin on a super scope", async () => {
    fakeDb(societyAdmin);
    expect((await authorize({ kind: "super" })).ok).toBe(false);
  });
  it("allows a super admin on a super scope", async () => {
    fakeDb({ sub: UID, roles: [{ role: "super_admin", society_id: null }] });
    expect((await authorize({ kind: "super" })).ok).toBe(true);
  });
  it("denies a foreign society and allows the own one", async () => {
    fakeDb(societyAdmin);
    expect((await authorize({ kind: "society", societyId: CS })).ok).toBe(false);
    const own = await authorize({ kind: "society", societyId: RAS });
    expect(own.ok && own.societyId).toBe(RAS);
  });
  it("takes the society from the event row", async () => {
    fakeDb(societyAdmin);
    const r = await authorize({ kind: "event", eventId: EV_RAS });
    expect(r.ok && r.societyId).toBe(RAS);
  });
  it("denies an event of another society and an unknown event identically", async () => {
    fakeDb(societyAdmin);
    const foreign = await authorize({ kind: "event", eventId: EV_CS });
    fakeDb(societyAdmin);
    const unknown = await authorize({ kind: "event", eventId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" });
    expect(foreign).toEqual(unknown);
    expect(foreign.ok).toBe(false);
  });
  it("rejects non-uuid ids without touching the database", async () => {
    fakeDb(societyAdmin);
    expect((await authorize({ kind: "event", eventId: "not-a-uuid" })).ok).toBe(false);
    expect((await authorize({ kind: "society", societyId: "'; drop table events;--" })).ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("requireAdmin", () => {
  it("redirects signed-out visitors to login with the path", async () => {
    fakeDb({ sub: null });
    await expect(requireAdmin("/admin/events")).rejects.toThrow("REDIRECT:/login?next=%2Fadmin%2Fevents");
  });
  it("shows a 404 to signed-in non-admins", async () => {
    fakeDb({ sub: UID, roles: [] });
    await expect(requireAdmin("/admin")).rejects.toThrow("NOT_FOUND");
    expect(nav.notFound).toHaveBeenCalled();
  });
  it("returns the context for admins", async () => {
    fakeDb({ sub: UID, roles: [{ role: "super_admin", society_id: null }] });
    const r = await requireAdmin("/admin");
    expect(r.ctx.isSuper).toBe(true);
  });
});
