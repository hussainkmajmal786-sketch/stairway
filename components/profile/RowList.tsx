"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export interface RowListProps<T extends { id?: string }> {
  title: string;
  addLabel: string;
  rows: T[];
  blank: () => T;
  /** Returns field errors keyed by field name; an empty object means valid. */
  validate: (row: T) => Record<string, string>;
  /** Persists a row; resolves with the saved row (with its id) or throws. */
  save: (row: T) => Promise<T>;
  /** Deletes a row. Resolves false if nothing matched (already gone); throws on error. */
  remove: (id: string) => Promise<boolean>;
  /** Short accessible name for a row, used in the edit/delete button labels. */
  label: (row: T) => string;
  summary: (row: T) => ReactNode;
  fields: (row: T, set: (patch: Partial<T>) => void, errors: Record<string, string>) => ReactNode;
}

const FIELD_SELECTOR = "input, textarea, select";

/** A list of rows where each row can be added, edited inline, saved and deleted (one edit at a time). */
export function RowList<T extends { id?: string }>(p: RowListProps<T>) {
  const [rows, setRows] = useState(p.rows);
  const [editing, setEditing] = useState<{ index: number; draft: T } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Synchronous guard against double-clicks landing before React re-renders with busy=true.
  const inFlight = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLLIElement>(null);
  /** data-focus-key of the control to focus once the editor closes (the button that opened it). */
  const returnFocus = useRef<string | null>(null);
  const focusInvalid = useRef(false);

  const editingIndex = editing?.index ?? null;

  // Editor opened: focus its first field. Editor closed / row deleted: focus the control we noted.
  useEffect(() => {
    if (editingIndex !== null) {
      editorRef.current?.querySelector<HTMLElement>(FIELD_SELECTOR)?.focus();
    } else if (returnFocus.current) {
      const key = returnFocus.current;
      returnFocus.current = null;
      const el =
        sectionRef.current?.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`) ??
        sectionRef.current?.querySelector<HTMLElement>('[data-focus-key="add"]');
      el?.focus();
    }
  }, [editingIndex, rows]);

  // Failed validation: focus the first invalid field.
  useEffect(() => {
    if (!focusInvalid.current) return;
    focusInvalid.current = false;
    editorRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  const begin = (index: number, draft: T, trigger: string) => {
    returnFocus.current = trigger;
    setEditing({ index, draft });
    setErrors({});
    setMessage(null);
  };

  const close = () => {
    setEditing(null);
    setErrors({});
  };

  async function onSave() {
    if (!editing || inFlight.current) return;
    const errs = p.validate(editing.draft);
    if (Object.keys(errs).length) {
      focusInvalid.current = true;
      setErrors(errs);
      return;
    }
    const { index, draft } = editing;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await p.save(draft);
      setRows((r) => (index >= r.length ? [...r, saved] : r.map((x, i) => (i === index ? saved : x))));
      close();
    } catch {
      setMessage("Couldn't save. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function onRemove(index: number) {
    const row = rows[index];
    if (!row?.id || inFlight.current || !window.confirm("Delete this entry?")) return;
    const id = row.id;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      // false = nothing matched: the row is already gone (another tab) or not ours, so drop it here too.
      await p.remove(id);
      const next = rows[index + 1] ?? rows[index - 1];
      returnFocus.current = next?.id ? `delete-${next.id}` : "add";
      setRows((r) => r.filter((x) => x.id !== id));
    } catch {
      setMessage("Couldn't delete. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const locked = busy || !!editing;

  const editor = editing && (
    <li ref={editorRef} className="grid gap-5 bg-paper-2 p-5">
      {p.fields(editing.draft, (patch) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e)), errors)}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Save
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { close(); setMessage(null); }}>
          Cancel
        </button>
      </div>
    </li>
  );

  return (
    <section ref={sectionRef} className="box shadow-hard" aria-label={p.title}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink bg-paper-2 px-5 py-3">
        <h2 className="mono font-bold">{p.title}</h2>
        <button
          type="button" className="btn btn-sm btn-secondary" disabled={locked} data-focus-key="add"
          onClick={() => begin(rows.length, p.blank(), "add")}
        >
          <Plus size={16} strokeWidth={2} aria-hidden /> {p.addLabel}
        </button>
      </div>
      <ul className="divide-y-2 divide-ink">
        {rows.length === 0 && !editing && <li className="p-5 text-ink-3">Nothing here yet.</li>}
        {rows.map((row, i) =>
          editing?.index === i ? (
            <Fragment key={row.id ?? i}>{editor}</Fragment>
          ) : (
            <li key={row.id ?? i} className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0 break-words">{p.summary(row)}</div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button" disabled={locked} onClick={() => begin(i, row, `edit-${row.id ?? i}`)}
                  data-focus-key={`edit-${row.id ?? i}`}
                  className="grid h-11 w-11 place-items-center border-2 border-ink bg-paper hover:bg-yellow disabled:opacity-50"
                  aria-label={`Edit ${p.label(row)}`}
                >
                  <Pencil size={16} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button" disabled={locked} onClick={() => onRemove(i)}
                  data-focus-key={`delete-${row.id ?? i}`}
                  className="grid h-11 w-11 place-items-center border-2 border-ink bg-paper hover:bg-red disabled:opacity-50"
                  aria-label={`Delete ${p.label(row)}`}
                >
                  <Trash2 size={16} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </li>
          ),
        )}
        {editing && editing.index >= rows.length && editor}
      </ul>
      <p role="status" aria-live="polite" className="px-5 pb-4 text-sm font-semibold text-red-ink">{message}</p>
    </section>
  );
}

/** aria props for an input inside a RowList editor, pointing at the Field's error text. */
export function rowAria(id: string, error: string | undefined) {
  return { "aria-invalid": !!error, "aria-describedby": error ? `${id}-err` : undefined };
}
