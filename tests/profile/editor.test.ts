import { describe, expect, it } from "vitest";
import { experienceFromDb, linksFromDb, linksToDb } from "@/lib/profile/editor";

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
