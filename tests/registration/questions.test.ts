import { describe, expect, it } from "vitest";
import {
  answersSchema, emptyAnswers, jsonbTextBytes, parseQuestions, QuestionsSchema, type Question,
} from "@/lib/registration/questions";

const QS: Question[] = [
  { id: "laptop", label: "Will you bring a laptop?", type: "single_choice", options: ["Yes", "No"], required: true },
  { id: "goal", label: "Goal", help: "Optional", type: "textarea", required: false },
  { id: "nick", label: "Nickname", type: "text", required: false },
  { id: "fw", label: "Frameworks", type: "multi_choice", options: ["PyTorch", "JAX", "Keras"], required: true },
  { id: "agree", label: "I agree", type: "checkbox", required: true },
];
const ok = { laptop: "Yes", goal: "", nick: "", fw: ["PyTorch"], agree: true };

describe("QuestionsSchema", () => {
  it("accepts a valid list", () => expect(QuestionsSchema.safeParse(QS).success).toBe(true));
  it("rejects duplicate ids", () =>
    expect(QuestionsSchema.safeParse([QS[1], { ...QS[2], id: "goal" }]).success).toBe(false));
  it("rejects a choice with one option", () =>
    expect(QuestionsSchema.safeParse([{ ...QS[0], options: ["Yes"] }]).success).toBe(false));
  it("rejects duplicate options", () =>
    expect(QuestionsSchema.safeParse([{ ...QS[0], options: ["Yes", "Yes"] }]).success).toBe(false));
  it("rejects unknown types, extra keys and bad ids", () => {
    expect(QuestionsSchema.safeParse([{ id: "f", label: "F", type: "file", required: true }]).success).toBe(false);
    expect(QuestionsSchema.safeParse([{ ...QS[2], extra: 1 }]).success).toBe(false);
    expect(QuestionsSchema.safeParse([{ ...QS[2], id: "Bad id" }]).success).toBe(false);
    expect(QuestionsSchema.safeParse([{ ...QS[2], options: ["a", "b"] }]).success).toBe(false);
  });
  it("parseQuestions treats null as no questions and throws on garbage", () => {
    expect(parseQuestions(null)).toEqual([]);
    expect(() => parseQuestions({})).toThrow();
  });
  // private.questions_valid() rejects untrimmed labels/options (JS trim() whitespace set) instead of trimming them.
  it("rejects untrimmed labels and options like the database", () => {
    for (const ws of [" ", "\t", "\n", " ", " ", "　", "﻿"]) {
      expect(QuestionsSchema.safeParse([{ ...QS[2], label: `${ws}Nickname` }]).success).toBe(false);
      expect(QuestionsSchema.safeParse([{ ...QS[2], label: `Nickname${ws}` }]).success).toBe(false);
      expect(QuestionsSchema.safeParse([{ ...QS[0], options: ["Yes", `No${ws}`] }]).success).toBe(false);
    }
    expect(QuestionsSchema.safeParse([{ ...QS[2], label: " " }]).success).toBe(false);
    expect(parseQuestions([{ ...QS[2], label: "Nick name" }])[0].label).toBe("Nick name");
  });
  it("keeps help as written (the database does not trim it)", () => {
    expect(parseQuestions([{ ...QS[1], help: "  spaced  " }])[0]).toMatchObject({ help: "  spaced  " });
    expect(QuestionsSchema.safeParse([{ ...QS[1], help: "x".repeat(301) }]).success).toBe(false);
  });
  it("caps counts and lengths like the database", () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ ...QS[2], id: `q${i}` }));
    expect(QuestionsSchema.safeParse(many).success).toBe(false);
    expect(QuestionsSchema.safeParse(many.slice(0, 20)).success).toBe(true);
    expect(QuestionsSchema.safeParse([{ ...QS[2], label: "x".repeat(201) }]).success).toBe(false);
    expect(QuestionsSchema.safeParse([{ ...QS[0], options: ["Yes", "x".repeat(101)] }]).success).toBe(false);
    expect(QuestionsSchema.safeParse([{ ...QS[2], id: "x".repeat(41) }]).success).toBe(false);
  });
  it("rejects a question list over 16 KiB of jsonb text", () => {
    const big = Array.from({ length: 20 }, (_, i) => ({
      id: `q${i}`, label: "x".repeat(200), help: "y".repeat(300), type: "single_choice" as const,
      options: Array.from({ length: 20 }, (_, j) => `${j}`.padEnd(100, "z")), required: false,
    }));
    expect(QuestionsSchema.safeParse(big).success).toBe(false);
  });
});

describe("jsonbTextBytes", () => {
  it("measures the jsonb text form (', ' and ': ' separators, UTF-8 bytes)", () => {
    expect(jsonbTextBytes({ a: "x", b: [true, false] })).toBe('{"a": "x", "b": [true, false]}'.length);
    expect(jsonbTextBytes([])).toBe(2);
    expect(jsonbTextBytes({})).toBe(2);
    expect(jsonbTextBytes("é")).toBe(4);
    expect(jsonbTextBytes('a"\n')).toBe('"a\\"\\n"'.length);
  });
});

describe("answersSchema", () => {
  const s = answersSchema(QS);
  it("accepts complete answers", () => expect(s.safeParse(ok).success).toBe(true));
  it("requires required answers", () => {
    expect(s.safeParse({ ...ok, laptop: "" }).success).toBe(false);
    expect(s.safeParse({ ...ok, fw: [] }).success).toBe(false);
    expect(s.safeParse({ ...ok, agree: false }).success).toBe(false);
  });
  it("rejects options that do not exist and duplicates", () => {
    expect(s.safeParse({ ...ok, laptop: "Maybe" }).success).toBe(false);
    expect(s.safeParse({ ...ok, fw: ["Rust"] }).success).toBe(false);
    expect(s.safeParse({ ...ok, fw: ["JAX", "JAX"] }).success).toBe(false);
  });
  it("caps text lengths", () => {
    expect(s.safeParse({ ...ok, nick: "x".repeat(501) }).success).toBe(false);
    expect(s.safeParse({ ...ok, goal: "x".repeat(2001) }).success).toBe(false);
    expect(s.safeParse({ ...ok, goal: "x".repeat(2000) }).success).toBe(true);
  });
  it("rejects answers to unknown questions", () => expect(s.safeParse({ ...ok, extra: "x" }).success).toBe(false));
  it("required text must not be blank", () => {
    const t = answersSchema([{ id: "why", label: "Why", type: "text", required: true }]);
    expect(t.safeParse({ why: "   " }).success).toBe(false);
    expect(t.safeParse({ why: " ok " }).data).toEqual({ why: "ok" });
  });
  it("treats any whitespace as blank for required text", () => {
    const t = answersSchema([{ id: "why", label: "Why", type: "textarea", required: true }]);
    for (const blank of ["\t", "\n\n", " ", " 　 ", "﻿"]) expect(t.safeParse({ why: blank }).success).toBe(false);
    expect(t.safeParse({ why: "\n ok\t" }).data).toEqual({ why: "ok" });
  });
  it("rejects answers over 32 KiB of jsonb text as a form-level error", () => {
    const qs: Question[] = Array.from({ length: 20 }, (_, i) => ({
      id: `q${i}`, label: `Q${i}`, type: "textarea" as const, required: false,
    }));
    const r = answersSchema(qs).safeParse(Object.fromEntries(qs.map((q) => [q.id, "é".repeat(1000)])));
    expect(r.success).toBe(false);
    expect(r.error!.issues.some((i) => i.path.length === 0)).toBe(true);
  });
});

describe("emptyAnswers", () => {
  it("starts every question blank", () =>
    expect(emptyAnswers(QS)).toEqual({ laptop: "", goal: "", nick: "", fw: [], agree: false }));
  it("is valid when nothing is required", () => {
    const optional = QS.map((q) => ({ ...q, required: false }));
    expect(answersSchema(optional).safeParse(emptyAnswers(optional)).success).toBe(true);
  });
});
