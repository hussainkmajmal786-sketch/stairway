"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { moveItem, removeItem } from "@/lib/admin/questions-builder";

/**
 * Ordered list editor: each row has Move up / Move down / Remove buttons (no drag-only interaction) and every
 * change is announced in an aria-live region. `renderRow` draws the row's fields.
 */
export function ListEditor<T>({
  items,
  onChange,
  newItem,
  renderRow,
  noun,
  max,
  disabled,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  newItem: () => T;
  renderRow: (item: T, index: number, update: (patch: T) => void) => ReactNode;
  /** Singular noun for button labels and announcements, e.g. "agenda item". */
  noun: string;
  max: number;
  disabled?: boolean;
}) {
  const [announce, setAnnounce] = useState("");
  const btn = "btn btn-secondary btn-sm px-3";
  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      {items.length === 0 && <p className="mb-3 text-sm text-ink-3">No {noun}s yet.</p>}
      <ol className="grid gap-3">
        {items.map((item, i) => (
          <li key={i} className="grid gap-3 border-2 border-ink bg-paper-2 p-3 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-3">{renderRow(item, i, (patch) => onChange(items.map((x, j) => (j === i ? patch : x))))}</div>
            <div className="flex flex-wrap items-start gap-2 sm:flex-col">
              <button
                type="button"
                className={btn}
                disabled={disabled || i === 0}
                aria-label={`Move ${noun} ${i + 1} up`}
                onClick={() => {
                  onChange(moveItem(items, i, -1));
                  setAnnounce(`${noun} ${i + 1} moved up`);
                }}
              >
                <ArrowUp size={16} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className={btn}
                disabled={disabled || i === items.length - 1}
                aria-label={`Move ${noun} ${i + 1} down`}
                onClick={() => {
                  onChange(moveItem(items, i, 1));
                  setAnnounce(`${noun} ${i + 1} moved down`);
                }}
              >
                <ArrowDown size={16} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className={btn}
                disabled={disabled}
                aria-label={`Remove ${noun} ${i + 1}`}
                onClick={() => {
                  onChange(removeItem(items, i));
                  setAnnounce(`${noun} ${i + 1} removed`);
                }}
              >
                <Trash2 size={16} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn-secondary btn-sm mt-3"
        disabled={disabled || items.length >= max}
        onClick={() => {
          onChange([...items, newItem()]);
          setAnnounce(`${noun} ${items.length + 1} added`);
        }}
      >
        <Plus size={16} strokeWidth={2} aria-hidden /> Add {noun}
      </button>
      {items.length >= max && <p className="mt-2 text-xs text-ink-3">Maximum of {max} reached.</p>}
    </div>
  );
}
