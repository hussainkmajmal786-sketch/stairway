"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { QuestionField } from "@/components/registration/QuestionField";
import { emptyAnswers, type Answers, type Question } from "@/lib/registration/questions";
import { blankQuestion, finalizeQuestions, moveItem, QUESTION_TYPES, removeItem } from "@/lib/admin/questions-builder";

type Choice = Extract<Question, { type: "single_choice" | "multi_choice" }>;
const isChoice = (q: Question): q is Choice => q.type === "single_choice" || q.type === "multi_choice";

/**
 * Custom registration questions. Controlled: `value` is the draft list (ids are regenerated from labels on save by
 * `finalizeQuestions`, except `lockedIds`, which already have answers). Reordering uses buttons, never drag-only.
 */
export function QuestionsBuilder({
  value,
  onChange,
  lockedIds,
  max = 20,
  errors,
  disabled,
}: {
  value: Question[];
  onChange: (next: Question[]) => void;
  lockedIds: ReadonlySet<string>;
  max?: number;
  /** Error message per question index (from validating the finalized list). */
  errors?: Record<number, string>;
  disabled?: boolean;
}) {
  const [announce, setAnnounce] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [addType, setAddType] = useState<Question["type"]>("text");
  const taken = () => new Set([...lockedIds, ...value.map((q) => q.id)]);

  const patch = (i: number, next: Question) => onChange(value.map((q, j) => (j === i ? next : q)));
  const setType = (i: number, type: Question["type"]) => {
    const q = value[i];
    const base = { id: q.id, label: q.label, required: q.required, ...(q.help ? { help: q.help } : {}) };
    patch(i, (type === "single_choice" || type === "multi_choice"
      ? { ...base, type, options: isChoice(q) ? q.options : ["Option 1", "Option 2"] }
      : { ...base, type }) as Question);
  };

  const previewQs = finalizeQuestions(value, lockedIds).filter((q) => q.label !== "");
  const previewAnswers: Answers = { ...emptyAnswers(previewQs), ...answers };

  return (
    <div className="grid gap-6">
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      {value.length === 0 && <p className="text-sm text-ink-3">No custom questions. Registration asks only for the basics.</p>}
      <ol className="grid gap-4">
        {value.map((q, i) => {
          const locked = lockedIds.has(q.id);
          const base = `qb-${i}`;
          return (
            <li key={`${q.id}-${i}`}>
              <fieldset className="grid gap-3 border-2 border-ink bg-paper-2 p-4">
                <legend className="mono px-2 font-bold">Question {i + 1}</legend>
                <Field id={`${base}-label`} label="Question" error={errors?.[i]} required>
                  <input
                    id={`${base}-label`}
                    className={inputCls}
                    value={q.label}
                    maxLength={200}
                    disabled={disabled}
                    aria-invalid={errors?.[i] ? true : undefined}
                    aria-describedby={errors?.[i] ? `${base}-label-err` : undefined}
                    onChange={(e) => patch(i, { ...q, label: e.target.value })}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id={`${base}-type`} label="Answer type" hint={locked ? "Locked: people have already answered this." : undefined}>
                    <select
                      id={`${base}-type`}
                      className={inputCls}
                      value={q.type}
                      disabled={disabled || locked}
                      onChange={(e) => setType(i, e.target.value as Question["type"])}
                    >
                      {QUESTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex min-h-12 items-center gap-3 self-end font-semibold">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={q.required}
                      disabled={disabled}
                      onChange={(e) => patch(i, { ...q, required: e.target.checked })}
                    />
                    Required
                  </label>
                </div>
                <Field id={`${base}-help`} label="Help text (optional)">
                  <textarea
                    id={`${base}-help`}
                    className={`${textareaCls} min-h-20`}
                    maxLength={300}
                    value={q.help ?? ""}
                    disabled={disabled}
                    onChange={(e) => patch(i, { ...q, help: e.target.value })}
                  />
                </Field>

                {isChoice(q) && (
                  <div>
                    <p className="mono mb-2 font-bold">Options (at least 2)</p>
                    <ul className="grid gap-2">
                      {q.options.map((o, k) => (
                        <li key={k} className="flex gap-2">
                          <label htmlFor={`${base}-opt-${k}`} className="sr-only">
                            Option {k + 1}
                          </label>
                          <input
                            id={`${base}-opt-${k}`}
                            className={inputCls}
                            value={o}
                            maxLength={100}
                            disabled={disabled}
                            onChange={(e) => patch(i, { ...q, options: q.options.map((x, j) => (j === k ? e.target.value : x)) })}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm px-3"
                            disabled={disabled || q.options.length <= 2}
                            aria-label={`Remove option ${k + 1} of question ${i + 1}`}
                            onClick={() => patch(i, { ...q, options: removeItem(q.options, k) })}
                          >
                            <Trash2 size={16} strokeWidth={2} aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm mt-2"
                      disabled={disabled || q.options.length >= 20}
                      onClick={() => patch(i, { ...q, options: [...q.options, ""] })}
                    >
                      <Plus size={16} strokeWidth={2} aria-hidden /> Add option
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={disabled || i === 0}
                    onClick={() => {
                      onChange(moveItem(value, i, -1));
                      setAnnounce(`Question ${i + 1} moved up`);
                    }}
                  >
                    <ArrowUp size={16} strokeWidth={2} aria-hidden /> Move up
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={disabled || i === value.length - 1}
                    onClick={() => {
                      onChange(moveItem(value, i, 1));
                      setAnnounce(`Question ${i + 1} moved down`);
                    }}
                  >
                    <ArrowDown size={16} strokeWidth={2} aria-hidden /> Move down
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={disabled}
                    onClick={() => {
                      onChange(removeItem(value, i));
                      setAnnounce(`Question ${i + 1} removed`);
                    }}
                  >
                    <Trash2 size={16} strokeWidth={2} aria-hidden /> Remove
                  </button>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div>
        <label htmlFor="qb-add-type" className="mono mb-2 block font-bold">
          Add a question
        </label>
        <div className="flex flex-wrap gap-2">
          <select
            id="qb-add-type"
            className={`${inputCls} max-w-xs`}
            value={addType}
            onChange={(e) => setAddType(e.target.value as Question["type"])}
            disabled={disabled || value.length >= max}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={disabled || value.length >= max}
            onClick={() => {
              onChange([...value, blankQuestion(addType, taken())]);
              setAnnounce(`Question ${value.length + 1} added`);
            }}
          >
            <Plus size={16} strokeWidth={2} aria-hidden /> Add question
          </button>
        </div>
        {value.length >= max && <p className="mt-2 text-xs text-ink-3">Maximum of {max} questions.</p>}
      </div>

      {previewQs.length > 0 && (
        <section aria-labelledby="qb-preview" className="border-2 border-dashed border-ink p-4">
          <h3 id="qb-preview" className="mono mb-3 font-bold">
            How it looks to registrants
          </h3>
          <div className="grid gap-4">
            {previewQs.map((q) => (
              <QuestionField
                key={q.id}
                q={q}
                value={previewAnswers[q.id]}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                onBlur={() => undefined}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
