"use client";

import { createClient } from "@/lib/supabase/browser";
import { ProjectSchema, fieldErrors } from "@/lib/profile/schema";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { RowList, rowAria } from "./RowList";

export interface ProjectRow { id?: string; title: string; description: string; url: string }

const COLS = "id, title, description, url";

export function ProjectsEditor({ userId, initial }: { userId: string; initial: ProjectRow[] }) {
  return (
    <RowList<ProjectRow>
      title="Projects"
      addLabel="Add project"
      rows={initial}
      blank={() => ({ title: "", description: "", url: "" })}
      validate={(r) => {
        const x = ProjectSchema.safeParse(r);
        return x.success ? {} : fieldErrors(x.error);
      }}
      save={async (r) => {
        const v = ProjectSchema.parse(r);
        const db = createClient();
        const payload = { title: v.title, description: v.description, url: v.url };
        // .single() errors when RLS hides the row (0 rows), so a blocked write is never reported as saved.
        const { data, error } = r.id
          ? await db.from("profile_projects").update(payload).eq("id", r.id).eq("user_id", userId).select(COLS).single()
          : await db.from("profile_projects").insert({ ...payload, user_id: userId }).select(COLS).single();
        if (error || !data) throw error ?? new Error("save failed");
        return data;
      }}
      remove={async (id) => {
        const { data, error } = await createClient().from("profile_projects").delete().eq("id", id).eq("user_id", userId).select("id");
        if (error) throw error;
        return data.length > 0;
      }}
      label={(r) => `project ${r.title}`}
      summary={(r) => (
        <>
          <p className="font-semibold">{r.title}</p>
          {r.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{r.description}</p>}
          {r.url && (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block break-all text-sm font-semibold text-blue-ink underline">
              {r.url}
            </a>
          )}
        </>
      )}
      fields={(r, set, e) => (
        <>
          <Field id="project-title" label="Title" required error={e.title}>
            <input id="project-title" className={inputCls} maxLength={100} value={r.title} onChange={(ev) => set({ title: ev.target.value })} {...rowAria("project-title", e.title)} />
          </Field>
          <Field id="project-url" label="Link" error={e.url} hint="Demo, repository or write-up (https://…)">
            <input id="project-url" type="url" inputMode="url" placeholder="https://" className={inputCls} value={r.url} onChange={(ev) => set({ url: ev.target.value })} {...rowAria("project-url", e.url)} />
          </Field>
          <Field id="project-description" label="What did you build?" error={e.description}>
            <textarea id="project-description" className={textareaCls} maxLength={500} value={r.description} onChange={(ev) => set({ description: ev.target.value })} {...rowAria("project-description", e.description)} />
          </Field>
        </>
      )}
    />
  );
}
