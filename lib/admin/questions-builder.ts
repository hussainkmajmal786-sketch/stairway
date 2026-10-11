import type { Question } from "@/lib/registration/questions";

// Pure helpers behind the custom-questions builder. The builder's output always satisfies QuestionsSchema when the
// admin has filled the labels and options (the server validates again; the database CHECK is the backstop).

export const QUESTION_TYPES = [
  { value: "text", label: "Short answer" },
  { value: "textarea", label: "Long answer" },
  { value: "single_choice", label: "Pick one" },
  { value: "multi_choice", label: "Pick several" },
  { value: "checkbox", label: "Tick box" },
] as const satisfies readonly { value: Question["type"]; label: string }[];

export const MAX_QUESTIONS = 20;

/** Ids are `^[a-z][a-z0-9_]{0,39}$`, derived from the label, unique among `taken` (which is not mutated). */
export function slugifyId(label: string, taken: ReadonlySet<string>): string {
  let base = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base === "") base = "question";
  if (!/^[a-z]/.test(base)) base = `q_${base}`;
  base = base.slice(0, 40).replace(/_+$/g, "") || "question";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = `_${n}`;
    const candidate = `${base.slice(0, 40 - suffix.length).replace(/_+$/g, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("could not generate a unique id");
}

export function blankQuestion(type: Question["type"], taken: ReadonlySet<string>): Question {
  const id = slugifyId("", taken);
  const base = { id, label: "", required: false };
  if (type === "single_choice" || type === "multi_choice") return { ...base, type, options: ["Option 1", "Option 2"] };
  return { ...base, type };
}

/** Return a new list with item `index` moved by `delta` (-1 up, +1 down); a move past either edge is a no-op. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/**
 * Normalises a draft list for saving: trims text, drops empty help, de-duplicates options (first wins), and
 * regenerates ids from labels EXCEPT ids in `locked` (those already have answers and must keep their meaning).
 */
export function finalizeQuestions(drafts: readonly Question[], locked: ReadonlySet<string> = new Set()): Question[] {
  const taken = new Set<string>([...locked]);
  return drafts.map((q) => {
    const keepId = locked.has(q.id);
    const id = keepId ? q.id : slugifyId(q.label, taken);
    taken.add(id);
    const label = q.label.trim();
    const help = q.help?.trim();
    const base = { id, label, required: q.required, ...(help ? { help } : {}) };
    if (q.type === "single_choice" || q.type === "multi_choice") {
      const seen = new Set<string>();
      const options = q.options
        .map((o) => o.trim())
        .filter((o) => {
          if (o === "" || seen.has(o)) return false;
          seen.add(o);
          return true;
        });
      return { ...base, type: q.type, options };
    }
    return { ...base, type: q.type } as Question;
  });
}
