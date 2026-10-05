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
    const e = fieldErrors(r.error!);
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
    expect(ProfileDetailsSchema.safeParse({ ...base, skills: Array.from({ length: 31 }, (_, i) => `s${i}`) }).success).toBe(false);
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
  it("rejects an experience that ends before it starts", () => {
    const base = { title: "Intern", organization: "Acme", description: "" };
    expect(ExperienceSchema.safeParse({ ...base, startDate: "2026-02-01", endDate: "2026-01-01" }).success).toBe(false);
    expect(ExperienceSchema.safeParse({ ...base, startDate: "2026-01-01", endDate: "" }).success).toBe(true);
  });
});
