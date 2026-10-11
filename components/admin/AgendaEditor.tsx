"use client";

import { Field, inputCls } from "@/components/ui/Field";
import { ListEditor } from "./ListEditor";

export interface AgendaDraft {
  time: string;
  title: string;
  detail: string;
}

export function AgendaEditor({
  items,
  onChange,
  idPrefix,
  disabled,
}: {
  items: AgendaDraft[];
  onChange: (next: AgendaDraft[]) => void;
  idPrefix: string;
  disabled?: boolean;
}) {
  return (
    <ListEditor
      items={items}
      onChange={onChange}
      noun="agenda item"
      max={30}
      disabled={disabled}
      newItem={() => ({ time: "", title: "", detail: "" })}
      renderRow={(item, i, update) => (
        <>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <Field id={`${idPrefix}-${i}-time`} label="Time" hint="Like 10:00 or Day 1">
              <input id={`${idPrefix}-${i}-time`} className={inputCls} maxLength={20} value={item.time} disabled={disabled} onChange={(e) => update({ ...item, time: e.target.value })} />
            </Field>
            <Field id={`${idPrefix}-${i}-title`} label="Title">
              <input id={`${idPrefix}-${i}-title`} className={inputCls} maxLength={120} value={item.title} disabled={disabled} onChange={(e) => update({ ...item, title: e.target.value })} />
            </Field>
          </div>
          <Field id={`${idPrefix}-${i}-detail`} label="Detail (optional)">
            <input id={`${idPrefix}-${i}-detail`} className={inputCls} maxLength={400} value={item.detail} disabled={disabled} onChange={(e) => update({ ...item, detail: e.target.value })} />
          </Field>
        </>
      )}
    />
  );
}

export function StringListEditor({
  items,
  onChange,
  idPrefix,
  noun,
  disabled,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  idPrefix: string;
  noun: string;
  disabled?: boolean;
}) {
  return (
    <ListEditor
      items={items}
      onChange={onChange}
      noun={noun}
      max={20}
      disabled={disabled}
      newItem={() => ""}
      renderRow={(item, i, update) => (
        <Field id={`${idPrefix}-${i}`} label={`${noun[0].toUpperCase()}${noun.slice(1)} ${i + 1}`}>
          <input id={`${idPrefix}-${i}`} className={inputCls} maxLength={120} value={item} disabled={disabled} onChange={(e) => update(e.target.value)} />
        </Field>
      )}
    />
  );
}
