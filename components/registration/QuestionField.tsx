"use client";

import { Field, FieldError, fieldDescribedBy, inputCls, textareaCls } from "@/components/ui/Field";
import { TEXT_MAX, TEXTAREA_MAX, type AnswerValue, type Question } from "@/lib/registration/questions";
import { cn } from "@/lib/utils";

const Req = () => (
  <>
    <span className="ml-0.5 text-red-ink" aria-hidden>*</span>
    <span className="sr-only"> (required)</span>
  </>
);

function GroupError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return <FieldError id={`${id}-err`}>{error}</FieldError>;
}

const optionCls = (on: boolean) =>
  cn(
    "flex min-h-12 cursor-pointer items-center gap-3 border-2 border-ink px-4 py-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-field",
    on ? "bg-yellow" : "bg-paper hover:bg-paper-2",
  );

const describedBy = (...ids: (string | null | false | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

/**
 * One custom question. The focusable element for "focus first invalid" always has id `q-<question id>`
 * (the first option for choice groups).
 */
export function QuestionField({
  q, value, error, onChange, onBlur,
}: {
  q: Question; value: AnswerValue; error?: string; onChange: (v: AnswerValue) => void; onBlur: () => void;
}) {
  const id = `q-${q.id}`;

  if (q.type === "text" || q.type === "textarea") {
    const v = typeof value === "string" ? value : "";
    const a11y = { "aria-required": q.required, "aria-invalid": !!error, "aria-describedby": fieldDescribedBy(id, { error, hint: q.help }) };
    return (
      <Field id={id} label={q.label} required={q.required} error={error} hint={q.help}>
        {q.type === "text" ? (
          <input id={id} className={inputCls} value={v} maxLength={TEXT_MAX} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} {...a11y} />
        ) : (
          <textarea id={id} className={textareaCls} rows={4} value={v} maxLength={TEXTAREA_MAX} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} {...a11y} />
        )}
      </Field>
    );
  }

  if (q.type === "checkbox") {
    const on = value === true;
    return (
      <div>
        <label className={optionCls(on)}>
          <input
            id={id} type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} onBlur={onBlur}
            className="h-5 w-5 shrink-0 accent-ink" aria-required={q.required} aria-invalid={!!error}
            aria-describedby={describedBy(q.help && `${id}-help`, error && `${id}-err`)}
          />
          <span>{q.label}{q.required && <Req />}</span>
        </label>
        {q.help && <p id={`${id}-help`} className="mt-1.5 text-xs text-ink-3">{q.help}</p>}
        <GroupError id={id} error={error} />
      </div>
    );
  }

  const multi = q.type === "multi_choice";
  const selected: string[] = multi ? (Array.isArray(value) ? value : []) : typeof value === "string" && value ? [value] : [];
  const toggle = (opt: string) => {
    if (!multi) return onChange(opt);
    const on = selected.includes(opt);
    onChange(q.options.filter((o) => (o === opt ? !on : selected.includes(o))));
  };

  return (
    <fieldset
      aria-describedby={describedBy(q.help && `${id}-help`, error && `${id}-err`)}
      // Validate when focus leaves the whole group, not when it moves between its options.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur();
      }}
    >
      <legend className="mono mb-2 font-bold">{q.label}{q.required && <Req />}</legend>
      {q.help && <p id={`${id}-help`} className="mb-2 text-xs text-ink-3">{q.help}</p>}
      {multi && <p className="mb-2 text-xs text-ink-3">Choose all that apply.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options.map((opt, i) => {
          const on = selected.includes(opt);
          return (
            <label key={opt} className={optionCls(on)}>
              <input
                id={i === 0 ? id : `${id}-${i}`} type={multi ? "checkbox" : "radio"} name={id} value={opt} checked={on}
                onChange={() => toggle(opt)} className="h-5 w-5 shrink-0 accent-ink" aria-invalid={!!error}
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
      <GroupError id={id} error={error} />
    </fieldset>
  );
}
