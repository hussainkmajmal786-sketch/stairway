import { describe, expect, it } from "vitest";
import { adminCaps, canManageSociety } from "@/lib/admin/caps";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("adminCaps", () => {
  it("is empty for no rows", () => {
    expect(adminCaps([])).toEqual({ isSuper: false, societyIds: [] });
  });
  it("detects a super admin", () => {
    expect(adminCaps([{ role: "super_admin", society_id: null }])).toEqual({ isSuper: true, societyIds: [] });
  });
  it("collects society ids, deduplicated", () => {
    const caps = adminCaps([
      { role: "society_admin", society_id: A },
      { role: "society_admin", society_id: A },
      { role: "society_admin", society_id: B },
    ]);
    expect(caps.isSuper).toBe(false);
    expect(caps.societyIds.sort()).toEqual([A, B]);
  });
  it("handles a mixed set and ignores a society row without a society", () => {
    const caps = adminCaps([
      { role: "super_admin", society_id: null },
      { role: "society_admin", society_id: A },
      { role: "society_admin", society_id: null },
    ]);
    expect(caps).toEqual({ isSuper: true, societyIds: [A] });
  });
});

describe("canManageSociety", () => {
  it("lets a super admin manage any society", () => {
    expect(canManageSociety({ isSuper: true, societyIds: [] }, A)).toBe(true);
  });
  it("limits a society admin to their societies", () => {
    const caps = { isSuper: false, societyIds: [A] };
    expect(canManageSociety(caps, A)).toBe(true);
    expect(canManageSociety(caps, B)).toBe(false);
  });
  it("denies a caller with no roles", () => {
    expect(canManageSociety({ isSuper: false, societyIds: [] }, A)).toBe(false);
  });
});
