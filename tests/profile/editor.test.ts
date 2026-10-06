import { describe, expect, it } from "vitest";
import { dedupeSkills, experienceFromDb, linksFromDb, linksToDb, mergeSaved, skillDraftError } from "@/lib/profile/editor";

describe("experienceFromDb", () => {
  it("maps snake_case columns and turns a null end date into an empty string", () => {
    expect(
      experienceFromDb([
        { id: "a", title: "Intern", organization: "ISRO", start_date: "2025-05-01", end_date: null, description: "" },
        { id: "b", title: "Lead", organization: "IEEE", start_date: "2024-01-01", end_date: "2024-12-31", description: "x" },
      ]),
    ).toEqual([
      { id: "a", title: "Intern", organization: "ISRO", startDate: "2025-05-01", endDate: "", description: "" },
      { id: "b", title: "Lead", organization: "IEEE", startDate: "2024-01-01", endDate: "2024-12-31", description: "x" },
    ]);
  });
});

describe("linksFromDb", () => {
  it("fills every social key and drops unknown keys and non-strings", () => {
    expect(linksFromDb({ github: "https://github.com/a", x: 5, evil: "https://e.com" })).toEqual({
      linkedin: "", github: "https://github.com/a", x: "", instagram: "", website: "",
    });
  });
  it("handles null, arrays and primitives", () => {
    for (const raw of [null, undefined, [], "str", 3]) {
      expect(Object.values(linksFromDb(raw)).every((v) => v === "")).toBe(true);
    }
  });
});

describe("linksToDb", () => {
  it("keeps only non-empty links", () => {
    expect(linksToDb({ linkedin: "", github: "https://github.com/a", x: "", instagram: "", website: "https://a.dev" })).toEqual({
      github: "https://github.com/a", website: "https://a.dev",
    });
  });
});

describe("skill helpers", () => {
  it("skillDraftError flags too-long drafts and a full list, but not duplicates or blanks", () => {
    expect(skillDraftError("   ", [])).toBeNull();
    expect(skillDraftError("x".repeat(31), [])).toMatch(/30 characters/);
    const full = Array.from({ length: 30 }, (_, i) => `s${i}`);
    expect(skillDraftError("new", full)).toMatch(/Up to 30/);
    expect(skillDraftError("S1", full)).toBeNull();
    expect(skillDraftError("  React  ", ["Go"])).toBeNull();
  });
  it("dedupeSkills normalises, drops blanks and case-insensitive duplicates", () => {
    expect(dedupeSkills(["React", " react ", "", "Machine   Learning", "GO", "go"])).toEqual(["React", "Machine Learning", "GO"]);
    expect(dedupeSkills(null)).toEqual([]);
  });
});

describe("mergeSaved", () => {
  it("applies saved values only to fields unchanged since submit", () => {
    const links = { a: " https://x " };
    const sent = { name: " Ada ", bio: "old", links };
    const current = { ...sent, bio: "typed during save" };
    const merged = mergeSaved(current, sent, { name: "Ada", bio: "old", links: { a: "https://x" } });
    expect(merged).toEqual({ name: "Ada", bio: "typed during save", links: { a: "https://x" } });
  });
});
