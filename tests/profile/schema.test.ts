import { describe, expect, it } from "vitest";
import { ExperienceSchema, OnboardingSchema, PrivateSchema, ProfileDetailsSchema, ProjectSchema, fieldErrors } from "@/lib/profile/schema";

const ok = { fullName: "Ada Lovelace", handle: "ada-l", college: "CEK", branch: "Computer Science", year: "3rd year" };

describe("OnboardingSchema", () => {
  it("accepts valid input and normalises the handle", () => {
    expect(OnboardingSchema.parse({ ...ok, handle: "Ada-L" }).handle).toBe("ada-l");
  });
  it("rejects bad handle, branch and short name with friendly messages", () => {
    const r = OnboardingSchema.safeParse({ ...ok, handle: "A", branch: "Nope", fullName: "A" });
    expect(r.success).toBe(false);
    if (r.success) return;
    const e = fieldErrors(r.error);
    expect(e.handle).toMatch(/3–30/);
    expect(e.branch).toBeTruthy();
    expect(e.fullName).toBeTruthy();
  });
});

describe("ProfileDetailsSchema", () => {
  const base = { ...ok, headline: "", bio: "", skills: [], links: { linkedin: "", github: "", x: "", instagram: "", website: "" } };
  it("accepts empty optional fields", () => {
    expect(ProfileDetailsSchema.safeParse(base).success).toBe(true);
  });
  it("rejects non-http links and too many skills", () => {
    expect(ProfileDetailsSchema.safeParse({ ...base, links: { ...base.links, github: "javascript:alert(1)" } }).success).toBe(false);
    expect(ProfileDetailsSchema.safeParse({ ...base, links: { ...base.links, github: "https://github.com/ada" } }).success).toBe(true);
    const padded = ProfileDetailsSchema.safeParse({ ...base, links: { ...base.links, github: "  https://github.com/ada  " } });
    expect(padded.success && padded.data.links.github).toBe("https://github.com/ada");
    expect(ProjectSchema.safeParse({ title: "Bus tracker", description: "", url: "https://x.dev " }).success).toBe(true);
    expect(ProfileDetailsSchema.safeParse({ ...base, links: { ...base.links, x: "   " } }).success).toBe(true);
    expect(ProfileDetailsSchema.safeParse({ ...base, skills: Array.from({ length: 31 }, (_, i) => `s${i}`) }).success).toBe(false);
  });
});

describe("length limits match the database", () => {
  const base = { ...ok, headline: "", bio: "", skills: [] as string[], links: { linkedin: "", github: "", x: "", instagram: "", website: "" } };
  const pass = (o: object) => ProfileDetailsSchema.safeParse({ ...base, ...o }).success;
  it("enforces boundaries", () => {
    expect(pass({ fullName: "a".repeat(80) })).toBe(true);
    expect(pass({ fullName: "a".repeat(81) })).toBe(false);
    expect(pass({ headline: "a".repeat(120) })).toBe(true);
    expect(pass({ headline: "a".repeat(121) })).toBe(false);
    expect(pass({ bio: "a".repeat(1500) })).toBe(true);
    expect(pass({ bio: "a".repeat(1501) })).toBe(false);
    // 5 links x 300 chars stays under the 2 KB profiles_links_shape check.
    const link = (n: number) => "https://a.dev/" + "a".repeat(n - "https://a.dev/".length);
    expect(pass({ links: { ...base.links, website: link(300) } })).toBe(true);
    expect(pass({ links: { ...base.links, website: link(301) } })).toBe(false);
    const all = { linkedin: link(300), github: link(300), x: link(300), instagram: link(300), website: link(300) };
    expect(JSON.stringify(all).length).toBeLessThanOrEqual(2048);
    // 30 skills x 30 chars fits the 929-char profiles_skills_len check.
    expect(pass({ skills: Array.from({ length: 30 }, (_, i) => String(i).padStart(30, "s")) })).toBe(true);
    expect(pass({ skills: Array.from({ length: 30 }, (_, i) => `s${i}`) })).toBe(true);
    expect(pass({ skills: Array.from({ length: 31 }, (_, i) => `s${i}`) })).toBe(false);
  });
});

describe("PrivateSchema", () => {
  it("allows empty and valid values, rejects bad phone / IEEE id", () => {
    expect(PrivateSchema.safeParse({ phone: "", ieeeMemberId: "" }).success).toBe(true);
    expect(PrivateSchema.safeParse({ phone: "+91 98765 43210", ieeeMemberId: "12345678" }).success).toBe(true);
    expect(PrivateSchema.safeParse({ phone: "12345", ieeeMemberId: "" }).success).toBe(false);
    expect(PrivateSchema.safeParse({ phone: "", ieeeMemberId: "abc" }).success).toBe(false);
  });
});

describe("ProjectSchema / ExperienceSchema", () => {
  it("requires a project title and an http url when given", () => {
    expect(ProjectSchema.safeParse({ title: "A", description: "", url: "" }).success).toBe(false);
    expect(ProjectSchema.safeParse({ title: "Bus tracker", description: "", url: "ftp://x" }).success).toBe(false);
    expect(ProjectSchema.safeParse({ title: "Bus tracker", description: "", url: "https://x.dev" }).success).toBe(true);
  });
  it("rejects impossible calendar dates and accepts real ones", () => {
    const base = { title: "Intern", organization: "Acme", description: "", endDate: "" };
    for (const d of ["2026-13-45", "2026-02-30"])
      expect(ExperienceSchema.safeParse({ ...base, startDate: d }).success).toBe(false);
    for (const d of ["2026-02-28", "2028-02-29"])
      expect(ExperienceSchema.safeParse({ ...base, startDate: d }).success).toBe(true);
  });
  it("rejects an experience that ends before it starts", () => {
    const base = { title: "Intern", organization: "Acme", description: "" };
    expect(ExperienceSchema.safeParse({ ...base, startDate: "2026-02-01", endDate: "2026-01-01" }).success).toBe(false);
    expect(ExperienceSchema.safeParse({ ...base, startDate: "2026-01-01", endDate: "" }).success).toBe(true);
  });
});
