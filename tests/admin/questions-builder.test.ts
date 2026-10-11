import { describe, expect, it } from "vitest";
import { QuestionsSchema, type Question } from "@/lib/registration/questions";
import { blankQuestion, finalizeQuestions, moveItem, removeItem, slugifyId } from "@/lib/admin/questions-builder";

describe("slugifyId", () => {
  it("derives a valid id from a label", () => {
    expect(slugifyId("What is your GitHub handle?", new Set())).toBe("what_is_your_github_handle");
    expect(slugifyId("Café & Chai", new Set())).toBe("cafe_chai");
  });
  it("handles empty, digit-leading and over-long labels", () => {
    expect(slugifyId("", new Set())).toBe("question");
    expect(slugifyId("2nd year?", new Set())).toBe("q_2nd_year");
    const long = slugifyId("a".repeat(100), new Set());
    expect(long).toHaveLength(40);
    expect(/^[a-z][a-z0-9_]{0,39}$/.test(long)).toBe(true);
  });
  it("avoids collisions without mutating the taken set", () => {
    const taken = new Set(["team", "team_2"]);
    expect(slugifyId("Team", taken)).toBe("team_3");
    expect([...taken]).toEqual(["team", "team_2"]);
    const full = new Set(["a".repeat(40)]);
    const id = slugifyId("a".repeat(60), full);
    expect(id).not.toBe("a".repeat(40));
    expect(id.length).toBeLessThanOrEqual(40);
  });
});

describe("finalizeQuestions", () => {
  const drafts: Question[] = [
    { id: "x1", label: "  Your team  ", type: "text", required: true, help: "  " },
    { id: "x2", label: "Your team", type: "textarea", required: false, help: "Tell us more" },
    { id: "x3", label: "Track", type: "single_choice", required: true, options: ["A", " A ", "B", "", "C"] },
    { id: "x4", label: "Topics", type: "multi_choice", required: false, options: ["Ml", "Systems"] },
    { id: "x5", label: "I agree", type: "checkbox", required: true },
  ];
  it("produces output that passes QuestionsSchema", () => {
    const out = finalizeQuestions(drafts);
    expect(QuestionsSchema.safeParse(out).success).toBe(true);
  });
  it("trims, drops empty help and de-duplicates options", () => {
    const out = finalizeQuestions(drafts);
    expect(out[0]).toEqual({ id: "your_team", label: "Your team", type: "text", required: true });
    expect(out[2]).toMatchObject({ type: "single_choice", options: ["A", "B", "C"] });
  });
  it("gives colliding labels unique ids", () => {
    const ids = finalizeQuestions(drafts).map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 2)).toEqual(["your_team", "your_team_2"]);
  });
  it("keeps locked ids stable and never reuses them for another question", () => {
    const out = finalizeQuestions(drafts, new Set(["x1", "your_team"]));
    expect(out[0].id).toBe("x1");
    expect(out[1].id).not.toBe("your_team");
    expect(new Set(out.map((q) => q.id)).size).toBe(out.length);
  });
  it("never emits options on non-choice types", () => {
    for (const q of finalizeQuestions(drafts)) {
      if (q.type !== "single_choice" && q.type !== "multi_choice") expect("options" in q).toBe(false);
    }
  });
});

describe("blankQuestion", () => {
  it("creates questions the schema accepts once labelled", () => {
    const taken = new Set<string>();
    const qs = (["text", "textarea", "single_choice", "multi_choice", "checkbox"] as const).map((t) => {
      const q = blankQuestion(t, taken);
      taken.add(q.id);
      return { ...q, label: `Question ${t}` };
    });
    expect(QuestionsSchema.safeParse(finalizeQuestions(qs)).success).toBe(true);
  });
});

describe("moveItem / removeItem", () => {
  it("moves up and down", () => {
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
  });
  it("is a no-op at the edges and for bad indexes", () => {
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 9, -1)).toEqual([1, 2, 3]);
  });
  it("removes by index without mutating", () => {
    const l = [1, 2, 3];
    expect(removeItem(l, 1)).toEqual([1, 3]);
    expect(l).toEqual([1, 2, 3]);
  });
});
