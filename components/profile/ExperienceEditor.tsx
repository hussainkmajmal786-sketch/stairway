"use client";

import { createClient } from "@/lib/supabase/browser";
import { ExperienceSchema, fieldErrors } from "@/lib/profile/schema";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { RowList, rowAria } from "./RowList";
import { experienceFromDb, type ExperienceDbRow, type ExperienceRow } from "@/lib/profile/editor";

const fmt = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }) : "";
const COLS = "id, title, organization, start_date, end_date, description";

export function ExperienceEditor({ userId, initial }: { userId: string; initial: ExperienceRow[] }) {
  return (
    <RowList<ExperienceRow>
      title="Experience"
      addLabel="Add experience"
      rows={initial}
      blank={() => ({ title: "", organization: "", startDate: "", endDate: "", description: "" })}
      validate={(r) => {
        const x = ExperienceSchema.safeParse(r);
        return x.success ? {} : fieldErrors(x.error);
      }}
      save={async (r) => {
        const v = ExperienceSchema.parse(r);
        const db = createClient();
        const payload = {
          title: v.title, organization: v.organization, start_date: v.startDate,
          end_date: v.endDate || null, description: v.description,
        };
        // .single() errors when RLS hides the row (0 rows), so a blocked write is never reported as saved.
        const { data, error } = r.id
          ? await db.from("profile_experience").update(payload).eq("id", r.id).eq("user_id", userId).select(COLS).single()
          : await db.from("profile_experience").insert({ ...payload, user_id: userId }).select(COLS).single();
        if (error || !data) throw error ?? new Error("save failed");
        return experienceFromDb([data as ExperienceDbRow])[0];
      }}
      remove={async (id) => {
        const { data, error } = await createClient().from("profile_experience").delete().eq("id", id).eq("user_id", userId).select("id");
        if (error || !data?.length) throw error ?? new Error("delete failed");
      }}
      label={(r) => `${r.title} at ${r.organization}`}
      summary={(r) => (
        <>
          <p className="font-semibold">
            {r.title} <span className="font-normal text-ink-3">· {r.organization}</span>
          </p>
          <p className="mono mt-1 text-[0.7rem] font-bold text-ink-3">
            {fmt(r.startDate)} – {r.endDate ? fmt(r.endDate) : "Present"}
          </p>
          {r.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{r.description}</p>}
        </>
      )}
      fields={(r, set, e) => (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="exp-title" label="Role" required error={e.title}>
              <input id="exp-title" className={inputCls} maxLength={100} value={r.title} onChange={(ev) => set({ title: ev.target.value })} {...rowAria("exp-title", e.title)} />
            </Field>
            <Field id="exp-org" label="Organisation" required error={e.organization}>
              <input id="exp-org" className={inputCls} maxLength={100} value={r.organization} onChange={(ev) => set({ organization: ev.target.value })} {...rowAria("exp-org", e.organization)} />
            </Field>
            <Field id="exp-start" label="Start date" required error={e.startDate}>
              <input id="exp-start" type="date" className={inputCls} value={r.startDate} onChange={(ev) => set({ startDate: ev.target.value })} {...rowAria("exp-start", e.startDate)} />
            </Field>
            <Field id="exp-end" label="End date" error={e.endDate} hint="Leave empty if it's current.">
              <input id="exp-end" type="date" className={inputCls} min={r.startDate || undefined} value={r.endDate} onChange={(ev) => set({ endDate: ev.target.value })} {...rowAria("exp-end", e.endDate)} />
            </Field>
          </div>
          <Field id="exp-desc" label="What did you do?" error={e.description}>
            <textarea id="exp-desc" className={textareaCls} maxLength={500} value={r.description} onChange={(ev) => set({ description: ev.target.value })} {...rowAria("exp-desc", e.description)} />
          </Field>
        </>
      )}
    />
  );
}
