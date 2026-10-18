import { describe, expect, it } from "vitest";
import { parsePage, parseRegistrantsPage, parseSearch, parseStatusFilter } from "@/lib/admin/registrants";

describe("registrants helpers", () => {
  it("parses a page and rejects drift", () => {
    const ok = parseRegistrantsPage({
      total: 1,
      rows: [{ registration_id: "r1", status: "confirmed", created_at: "2030-01-01T00:00:00Z", full_name: "A", email: null }],
    });
    expect(ok?.rows[0].status).toBe("confirmed");
    expect(parseRegistrantsPage({ total: 1, rows: [{ registration_id: "r1", status: "weird", created_at: "x" }] })).toBeNull();
    expect(parseRegistrantsPage(null)).toBeNull();
  });
  it("status filter accepts only known values", () => {
    expect(parseStatusFilter("waitlisted")).toBe("waitlisted");
    expect(parseStatusFilter("x' or 1=1")).toBeNull();
    expect(parseStatusFilter(["confirmed"])).toBeNull();
  });
  it("search is trimmed, capped and may be empty", () => {
    expect(parseSearch("  asha  ")).toBe("asha");
    expect(parseSearch("   ")).toBeNull();
    expect(parseSearch("x".repeat(200))).toHaveLength(80);
    expect(parseSearch(undefined)).toBeNull();
  });
  it("page is clamped", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parsePage("99999")).toBe(1000);
  });
});
