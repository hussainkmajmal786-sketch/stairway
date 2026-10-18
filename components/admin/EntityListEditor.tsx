"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteEntityAction, reorderEntitiesAction, saveEntityAction } from "@/lib/admin/content-actions";
import type { Entity } from "@/lib/admin/entities";
import { buildEntityData, type FieldSpec } from "@/lib/admin/entity-fields";
import type { AdminError } from "@/lib/admin/result";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { ConfirmDialog } from "./ConfirmDialog";
import { MediaUploader } from "./MediaUploader";

export interface EntityItem {
  id: string;
  updatedAt: string;
  title: string;
  subtitle?: string;
  values: Record<string, string>;
}
export interface EventOption {
  id: string;
  title: string;
}

/**
 * List + add/edit form for one entity. Every write is a server action that re-authorises; `canEdit` only hides the
 * controls. Reordering uses Move up / Move down buttons (no drag and drop, so it works by keyboard and on phones).
 */
export function EntityListEditor({
  entity,
  noun,
  items,
  fields,
  societyId,
  canEdit,
  eventOptions = [],
}: {
  entity: Entity;
  noun: string;
  items: EntityItem[];
  fields: FieldSpec[];
  /** Present for society-scoped lists; absent for site-wide lists. */
  societyId?: string;
  canEdit: boolean;
  eventOptions?: EventOption[];
}) {
  const router = useRouter();
  const formId = useId();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<AdminError | null>(null);
  const [note, setNote] = useState("");
  const [toDelete, setToDelete] = useState<EntityItem | null>(null);

  const open = (item: EntityItem | "new") => {
    setError(null);
    setNote("");
    setEditing(item === "new" ? "new" : item.id);
    setValues(item === "new" ? {} : { ...item.values });
  };
  const close = () => {
    setEditing(null);
    setError(null);
  };
  const current = editing && editing !== "new" ? items.find((i) => i.id === editing) : undefined;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const data = buildEntityData(fields, values);
      const r = await saveEntityAction({
        entity,
        ...(current ? { id: current.id, seenUpdatedAt: current.updatedAt } : { ...(societyId ? { societyId } : {}) }),
        data,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNote(current ? "Saved." : `${noun} added.`);
      close();
      router.refresh();
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    const ids = items.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setError(null);
    start(async () => {
      const r = await reorderEntitiesAction({ entity, ...(societyId ? { societyId } : {}), orderedIds: ids });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    start(async () => {
      const r = await deleteEntityAction({ entity, id: toDelete.id });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setToDelete(null);
      setNote(`${noun} deleted.`);
      router.refresh();
    });
  };

  const fe = error?.fieldErrors ?? {};
  const fieldKey = (name: string) => name.replace(/^links\./, "links.");

  return (
    <section className="grid gap-4">
      <p aria-live="polite" className="min-h-5 text-sm font-semibold">
        {note}
      </p>
      {error && editing === null && (
        <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
          {error.message}
        </p>
      )}

      {items.length === 0 ? (
        <p className="box p-4">Nothing here yet.</p>
      ) : (
        <ul className="box shadow-hard divide-y-2 divide-ink">
          {items.map((it, i) => (
            <li key={it.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <p className="break-words font-semibold">{it.title}</p>
                {it.subtitle && <p className="break-words text-sm text-ink-3">{it.subtitle}</p>}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={pending || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${it.title} up`}>
                    <ArrowUp size={16} aria-hidden /> Up
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={pending || i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${it.title} down`}>
                    <ArrowDown size={16} aria-hidden /> Down
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => open(it)}>
                    <Pencil size={16} aria-hidden /> Edit
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => { setError(null); setToDelete(it); }}>
                    <Trash2 size={16} aria-hidden /> Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && editing === null && (
        <div>
          <button type="button" className="btn btn-primary" onClick={() => open("new")}>
            <Plus size={16} aria-hidden /> Add {noun.toLowerCase()}
          </button>
        </div>
      )}

      {canEdit && editing !== null && (
        <form onSubmit={save} aria-labelledby={`${formId}-title`} className="box shadow-hard grid gap-4 p-5">
          <h3 id={`${formId}-title`} className="text-xl font-semibold">
            {current ? `Edit ${noun.toLowerCase()}` : `Add ${noun.toLowerCase()}`}
          </h3>
          {error && (
            <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
              {error.message}
            </p>
          )}
          {fields.map((f) => {
            const id = `${formId}-${f.name.replace(/\./g, "-")}`;
            const err = fe[fieldKey(f.name)];
            const v = values[f.name] ?? "";
            const set = (next: string) => setValues((s) => ({ ...s, [f.name]: next }));
            if (f.kind === "image") {
              return (
                <div key={f.name}>
                  <MediaUploader
                    kind={f.mediaKind ?? "gallery"}
                    target={societyId ? { societyId } : { site: true }}
                    label={f.label}
                    currentUrl={v || null}
                    onUploaded={set}
                    disabled={pending}
                  />
                  {v && (
                    <p className="mt-2 flex items-center gap-3 text-sm">
                      <span className="truncate">Image set.</span>
                      <button type="button" className="min-h-11 font-bold underline underline-offset-4" onClick={() => set("")}>
                        Remove image
                      </button>
                    </p>
                  )}
                  {err && <p role="alert" className="mt-1 text-sm font-semibold text-red-ink">{err}</p>}
                </div>
              );
            }
            return (
              <Field key={f.name} id={id} label={f.label} required={f.required} error={err} hint={f.hint}>
                {f.kind === "textarea" ? (
                  <textarea id={id} className={textareaCls} value={v} maxLength={f.maxLength} onChange={(e) => set(e.target.value)} aria-invalid={err ? true : undefined} />
                ) : f.kind === "select" ? (
                  <select id={id} className={inputCls} value={v} onChange={(e) => set(e.target.value)} aria-invalid={err ? true : undefined}>
                    <option value="">Choose…</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : f.kind === "event" ? (
                  <select id={id} className={inputCls} value={v} onChange={(e) => set(e.target.value)} aria-invalid={err ? true : undefined}>
                    <option value="">No session</option>
                    {eventOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.title}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    className={inputCls}
                    type={f.kind === "url" ? "url" : "text"}
                    inputMode={f.kind === "url" ? "url" : undefined}
                    value={v}
                    maxLength={f.maxLength}
                    autoComplete="off"
                    onChange={(e) => set(e.target.value)}
                    aria-invalid={err ? true : undefined}
                  />
                )}
              </Field>
            );
          })}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`Delete this ${noun.toLowerCase()}?`}
        description={`"${toDelete?.title ?? ""}" will be removed from the site. This cannot be undone.`}
        confirmLabel="Delete"
        pending={pending}
        error={toDelete ? error?.message : null}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
