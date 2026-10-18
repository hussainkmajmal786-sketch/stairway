"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { saveSettingsAction, saveStatsAction } from "@/lib/admin/settings-actions";
import type { AdminError } from "@/lib/admin/result";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";

export interface SettingsValues {
  announcement: { enabled: boolean; text: string };
  tagline: string;
  supportLine: string;
  description: string;
  contact: { email: string; sponsorEmail: string; coordinators: { name: string; role: string; phone: string }[] };
  social: { instagram: string; linkedin: string; whatsapp: string; youtube: string; github: string };
  ieee: { joinUrl: string; branchUrl: string };
  aftermovieUrl: string;
  sponsorDeckUrl: string;
  speakerFormUrl: string;
  volunteerFormUrl: string;
}

const SOCIAL = ["instagram", "linkedin", "whatsapp", "youtube", "github"] as const;

/** Editable site settings (a fixed whitelist; the server ignores everything else). */
export function SettingsForm({ initial, updatedAt }: { initial: SettingsValues; updatedAt: string }) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [v, setV] = useState<SettingsValues>(initial);
  const [error, setError] = useState<AdminError | null>(null);
  const [note, setNote] = useState("");
  const fe = error?.fieldErrors ?? {};
  const set = <K extends keyof SettingsValues>(k: K, value: SettingsValues[K]) => setV((s) => ({ ...s, [k]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNote("");
    start(async () => {
      const r = await saveSettingsAction({ patch: v, seenUpdatedAt: updatedAt });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNote("Saved. The site updates straight away.");
      router.refresh();
    });
  };

  const text = (key: "tagline" | "supportLine" | "aftermovieUrl" | "sponsorDeckUrl" | "speakerFormUrl" | "volunteerFormUrl", label: string, url = false) => (
    <Field id={`${id}-${key}`} label={label} error={fe[key]}>
      <input
        id={`${id}-${key}`}
        className={inputCls}
        type={url ? "url" : "text"}
        value={v[key]}
        autoComplete="off"
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={fe[key] ? true : undefined}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="grid gap-6">
      {error && (
        <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
          {error.message}
        </p>
      )}

      <fieldset className="box grid gap-4 p-5">
        <legend className="mono px-2 font-bold">Announcement bar</legend>
        <label className="flex min-h-11 items-center gap-3 font-semibold">
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={v.announcement.enabled}
            onChange={(e) => set("announcement", { ...v.announcement, enabled: e.target.checked })}
          />
          Show the announcement bar
        </label>
        <Field id={`${id}-ann`} label="Announcement text" error={fe["announcement.text"]}>
          <input
            id={`${id}-ann`}
            className={inputCls}
            value={v.announcement.text}
            maxLength={200}
            onChange={(e) => set("announcement", { ...v.announcement, text: e.target.value })}
          />
        </Field>
        {v.announcement.enabled && v.announcement.text && (
          <p className="border-2 border-ink bg-yellow p-3 text-center font-semibold" aria-label="Preview">
            {v.announcement.text}
          </p>
        )}
      </fieldset>

      <fieldset className="box grid gap-4 p-5">
        <legend className="mono px-2 font-bold">Words</legend>
        {text("tagline", "Tagline")}
        {text("supportLine", "Support line")}
        <Field id={`${id}-desc`} label="Site description" error={fe.description}>
          <textarea id={`${id}-desc`} className={textareaCls} value={v.description} maxLength={400} onChange={(e) => set("description", e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="box grid gap-4 p-5">
        <legend className="mono px-2 font-bold">Contact</legend>
        <Field id={`${id}-email`} label="Contact email" error={fe["contact.email"]}>
          <input id={`${id}-email`} className={inputCls} type="email" value={v.contact.email} onChange={(e) => set("contact", { ...v.contact, email: e.target.value })} />
        </Field>
        <Field id={`${id}-semail`} label="Sponsor email" error={fe["contact.sponsorEmail"]}>
          <input id={`${id}-semail`} className={inputCls} type="email" value={v.contact.sponsorEmail} onChange={(e) => set("contact", { ...v.contact, sponsorEmail: e.target.value })} />
        </Field>
        {v.contact.coordinators.map((c, i) => (
          <div key={i} className="grid gap-3 border-2 border-dashed border-ink p-3 md:grid-cols-3">
            {(["name", "role", "phone"] as const).map((k) => (
              <Field key={k} id={`${id}-co-${i}-${k}`} label={`Coordinator ${i + 1} ${k}`} error={fe[`contact.coordinators.${i}.${k}`]}>
                <input
                  id={`${id}-co-${i}-${k}`}
                  className={inputCls}
                  value={c[k]}
                  onChange={(e) =>
                    set("contact", {
                      ...v.contact,
                      coordinators: v.contact.coordinators.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)),
                    })
                  }
                />
              </Field>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-sm md:col-span-3 md:justify-self-start"
              onClick={() => set("contact", { ...v.contact, coordinators: v.contact.coordinators.filter((_, j) => j !== i) })}
            >
              <Trash2 size={16} aria-hidden /> Remove coordinator {i + 1}
            </button>
          </div>
        ))}
        {v.contact.coordinators.length < 10 && (
          <div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => set("contact", { ...v.contact, coordinators: [...v.contact.coordinators, { name: "", role: "", phone: "" }] })}
            >
              <Plus size={16} aria-hidden /> Add coordinator
            </button>
          </div>
        )}
      </fieldset>

      <fieldset className="box grid gap-4 p-5">
        <legend className="mono px-2 font-bold">Links</legend>
        {text("aftermovieUrl", "Aftermovie link", true)}
        {text("sponsorDeckUrl", "Sponsor deck link", true)}
        {text("speakerFormUrl", "Speaker form link", true)}
        {text("volunteerFormUrl", "Volunteer form link", true)}
        {SOCIAL.map((k) => (
          <Field key={k} id={`${id}-soc-${k}`} label={`${k[0].toUpperCase()}${k.slice(1)} link`} error={fe[`social.${k}`]}>
            <input
              id={`${id}-soc-${k}`}
              className={inputCls}
              type="url"
              value={v.social[k]}
              onChange={(e) => set("social", { ...v.social, [k]: e.target.value })}
            />
          </Field>
        ))}
        <Field id={`${id}-ieee-join`} label="IEEE join link" error={fe["ieee.joinUrl"]}>
          <input id={`${id}-ieee-join`} className={inputCls} type="url" value={v.ieee.joinUrl} onChange={(e) => set("ieee", { ...v.ieee, joinUrl: e.target.value })} />
        </Field>
        <Field id={`${id}-ieee-branch`} label="IEEE branch link" error={fe["ieee.branchUrl"]}>
          <input id={`${id}-ieee-branch`} className={inputCls} type="url" value={v.ieee.branchUrl} onChange={(e) => set("ieee", { ...v.ieee, branchUrl: e.target.value })} />
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        <p aria-live="polite" className="text-sm font-semibold">
          {note}
        </p>
      </div>
    </form>
  );
}

export interface StatItem {
  label: string;
  value: number;
  suffix: string;
}

/** The home-page numbers. */
export function StatsEditor({ initial, updatedAt }: { initial: StatItem[]; updatedAt: string }) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [items, setItems] = useState<StatItem[]>(initial);
  const [error, setError] = useState<AdminError | null>(null);
  const [note, setNote] = useState("");
  const fe = error?.fieldErrors ?? {};

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNote("");
    start(async () => {
      const r = await saveStatsAction({ items, seenUpdatedAt: updatedAt });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNote("Saved.");
      router.refresh();
    });
  };
  const patch = (i: number, p: Partial<StatItem>) => setItems((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <form onSubmit={submit} className="grid gap-4">
      {error && (
        <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
          {error.message}
        </p>
      )}
      {items.map((it, i) => (
        <div key={i} className="box grid gap-3 p-4 md:grid-cols-3">
          <Field id={`${id}-l-${i}`} label={`Number ${i + 1} label`} error={fe[`items.${i}.label`]}>
            <input id={`${id}-l-${i}`} className={inputCls} value={it.label} maxLength={40} onChange={(e) => patch(i, { label: e.target.value })} />
          </Field>
          <Field id={`${id}-v-${i}`} label="Value" error={fe[`items.${i}.value`]}>
            <input
              id={`${id}-v-${i}`}
              className={inputCls}
              type="number"
              min={0}
              value={it.value}
              onChange={(e) => patch(i, { value: Number.parseInt(e.target.value, 10) || 0 })}
            />
          </Field>
          <Field id={`${id}-s-${i}`} label="Suffix (for example +)" error={fe[`items.${i}.suffix`]}>
            <input id={`${id}-s-${i}`} className={inputCls} value={it.suffix} maxLength={8} onChange={(e) => patch(i, { suffix: e.target.value })} />
          </Field>
          <button type="button" className="btn btn-secondary btn-sm md:col-span-3 md:justify-self-start" onClick={() => setItems((s) => s.filter((_, j) => j !== i))}>
            <Trash2 size={16} aria-hidden /> Remove number {i + 1}
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        {items.length < 8 && (
          <button type="button" className="btn btn-secondary" onClick={() => setItems((s) => [...s, { label: "", value: 0, suffix: "" }])}>
            <Plus size={16} aria-hidden /> Add a number
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save numbers"}
        </button>
      </div>
      <p aria-live="polite" className="text-sm font-semibold">
        {note}
      </p>
    </form>
  );
}
