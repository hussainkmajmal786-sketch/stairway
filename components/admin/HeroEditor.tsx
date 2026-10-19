"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { HeroView, type HeroViewProps } from "@/components/sections/HeroView";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, fieldDescribedBy, inputCls } from "@/components/ui/Field";
import { resetHeroConfig, saveHeroConfig } from "@/lib/admin/hero-actions";
import {
  counter, draftToPatch, HERO_DRAFT_DEFAULTS, presetForKey, presetTabIndex, previewProgress, previewView, PREVIEW_NEXT,
  type HeroDraft,
} from "@/lib/admin/hero-editor";
import type { AdminError } from "@/lib/admin/result";
import { HERO_PRESET_LABELS, HERO_PRESETS, type HeroPreset } from "@/lib/design/tokens";
import { HERO_CTA_DEFAULTS } from "@/lib/design/hero";
import { HERO_LIMITS } from "@/lib/site/schema";
import { cn } from "@/lib/utils";

const BLURB: Record<HeroPreset, string> = {
  cobalt: "The original: cobalt field, yellow call to action.",
  ink: "Dark night poster with a blueprint grid.",
  daylight: "Light paper with ruled lines.",
  sunrise: "Warm field with a rising sun.",
};

/** A miniature poster drawn with the theme's own --hero-* variables (so it can never drift from the real hero). */
function Thumb({ preset }: { preset: HeroPreset }) {
  return (
    <span
      className="hero relative block h-20 w-full overflow-hidden border-2 border-ink"
      data-theme={preset}
      aria-hidden="true"
      style={{ background: "var(--hero-bg)" }}
    >
      <span className="absolute left-3 top-3 block h-2.5 w-16" style={{ background: "var(--hero-word)" }} />
      <span className="absolute left-3 top-7 block h-1.5 w-24" style={{ background: "var(--hero-fg)", opacity: 0.55 }} />
      <span className="absolute bottom-3 left-3 block h-4 w-12 border-2" style={{ background: "var(--hero-cta1-bg)", borderColor: "var(--hero-cta1-shadow)" }} />
      <span className="absolute bottom-3 left-[4.25rem] block h-4 w-12 border-2" style={{ background: "var(--hero-cta2-bg)", borderColor: "var(--hero-cta2-border)" }} />
      <span className="absolute -right-2 -top-2 block h-9 w-9 rounded-full" style={{ background: "var(--hero-accent)", opacity: 0.9 }} />
    </span>
  );
}

function PresetPicker({ value, onChange, labelId }: { value: HeroPreset; onChange: (p: HeroPreset) => void; labelId: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid gap-3 sm:grid-cols-2">
      {HERO_PRESETS.map((p) => {
        const selected = p === value;
        return (
          <button
            key={p}
            ref={(el) => {
              refs.current[p] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={presetTabIndex(p, value)}
            onClick={() => onChange(p)}
            onKeyDown={(e) => {
              const to = presetForKey(value, e.key);
              if (!to) return;
              e.preventDefault();
              onChange(to);
              refs.current[to]?.focus();
            }}
            className={cn(
              "box grid min-h-11 gap-2 p-3 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-field",
              selected ? "bg-paper-2 shadow-hard outline-3 -outline-offset-3 outline-ink" : "hover:bg-paper-2",
            )}
          >
            <Thumb preset={p} />
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">{HERO_PRESET_LABELS[p]}</span>
              {selected && (
                <span className="mono inline-flex items-center gap-1 border-2 border-ink bg-yellow px-1.5 text-xs font-bold">
                  <Check size={12} strokeWidth={3} aria-hidden /> Selected
                </span>
              )}
            </span>
            <span className="text-xs text-ink-3">{BLURB[p]}</span>
          </button>
        );
      })}
    </div>
  );
}

function Switch({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="h-6 w-6 shrink-0"
          checked={checked}
          aria-describedby={`${id}-hint`}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
        <span className="mono ml-auto text-xs font-bold">{checked ? "On" : "Off"}</span>
      </label>
      <p id={`${id}-hint`} className="text-xs text-ink-3">{hint}</p>
    </div>
  );
}

const INNER_W = 1200;
type PreviewBase = Omit<HeroViewProps, "view" | "preview" | "next" | "progress">;

/** The real HeroView, scaled down by CSS transform. Hidden from assistive tech and inert (no links, no focus). */
function ScaledPreview({ draft, base }: { draft: HeroDraft; base: PreviewBase }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [height, setHeight] = useState(520);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const s = Math.min(1, o.clientWidth / INNER_W);
      setScale(s);
      setHeight(Math.ceil(i.offsetHeight * s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="relative w-full overflow-hidden border-2 border-ink" style={{ height }} aria-hidden="true" inert>
      <div ref={inner} style={{ width: INNER_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <HeroView {...base} view={previewView(draft)} next={PREVIEW_NEXT} progress={previewProgress()} preview />
      </div>
    </div>
  );
}

export interface HeroEditorProps {
  initial: HeroDraft;
  /** The block's updated_at, or "" when nothing is stored yet. */
  updatedAt: string;
  preview: PreviewBase;
}

export function HeroEditor({ initial, updatedAt: initialUpdatedAt, preview }: HeroEditorProps) {
  const id = useId();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<HeroDraft>(initial);
  const [seen, setSeen] = useState(initialUpdatedAt);
  const [error, setError] = useState<AdminError | null>(null);
  const [status, setStatus] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const fe = error?.fieldErrors;
  const conflict = error?.code === "conflict";
  const set = <K extends keyof HeroDraft>(k: K, v: HeroDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Focus: the first invalid field, otherwise the alert.
  useEffect(() => {
    if (!error || conflict) return;
    const first = Object.keys(error.fieldErrors ?? {}).find((k) => k !== "_form");
    const el = first ? document.getElementById(`${id}-${first}`) : null;
    (el ?? alertRef.current)?.focus();
  }, [error, conflict, id]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus("");
    start(async () => {
      const r = await saveHeroConfig({ patch: draftToPatch(draft), seenUpdatedAt: seen });
      if (!r.ok) {
        if (r.error.code === "conflict") setStatus(r.error.message);
        setError(r.error);
        return;
      }
      setSeen(r.data.updatedAt);
      setStatus("Saved. The home page shows this now.");
    });
  };

  const doReset = () => {
    setError(null);
    setStatus("");
    start(async () => {
      const r = await resetHeroConfig({ seenUpdatedAt: seen });
      setConfirmReset(false);
      if (!r.ok) {
        if (r.error.code === "conflict") setStatus(r.error.message);
        setError(r.error);
        return;
      }
      setSeen(r.data.updatedAt);
      setDraft({ ...HERO_DRAFT_DEFAULTS });
      setStatus("Reset. The home page is back to the original poster.");
    });
  };

  const text = (key: "customHeadline" | "ghostWord" | "primaryCta" | "secondaryCta", label: string, max: number, hint: string, ph?: string) => {
    const err = fe?.[key];
    const fid = `${id}-${key}`;
    return (
      <Field id={fid} label={label} error={err} hint={hint}>
        <input
          id={fid}
          className={inputCls}
          value={draft[key]}
          placeholder={ph}
          autoComplete="off"
          aria-invalid={err ? true : undefined}
          aria-describedby={`${fieldDescribedBy(fid, { error: err, hint })} ${fid}-count`}
          onChange={(e) => set(key, e.target.value)}
        />
        <span id={`${fid}-count`} className={cn("mono mt-1 block text-right text-xs", draft[key].length > max ? "font-bold text-red-ink" : "text-ink-3")}>
          {counter(draft[key], max)}
        </span>
      </Field>
    );
  };

  return (
    <form onSubmit={submit} className="grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start" noValidate>
      <div className="grid min-w-0 gap-6">
        <fieldset className="box grid min-w-0 gap-3 p-5">
          <legend className="mono px-2 font-bold" id={`${id}-preset-label`}>Look</legend>
          <PresetPicker value={draft.preset} onChange={(p) => set("preset", p)} labelId={`${id}-preset-label`} />
        </fieldset>

        <fieldset className="box grid min-w-0 gap-4 p-5">
          <legend className="mono px-2 font-bold">Words</legend>
          <div role="radiogroup" aria-label="Headline" className="grid gap-1">
            <label className="flex min-h-11 items-center gap-3 font-semibold">
              <input type="radio" name={`${id}-hm`} className="h-6 w-6 shrink-0" checked={draft.headlineMode === "auto"} onChange={() => set("headlineMode", "auto")} />
              Automatic: the next step and its date
            </label>
            <label className="flex min-h-11 items-center gap-3 font-semibold">
              <input type="radio" name={`${id}-hm`} className="h-6 w-6 shrink-0" checked={draft.headlineMode === "custom"} onChange={() => set("headlineMode", "custom")} />
              My own headline
            </label>
          </div>
          {draft.headlineMode === "custom" &&
            text("customHeadline", "Custom headline", HERO_LIMITS.headline, "Plain text, shown under the buttons instead of the automatic line.")}
          {text("ghostWord", "Background word", HERO_LIMITS.ghost, "Optional. Capital letters, digits and spaces. Empty keeps CLIMB.", "CLIMB")}
          {text("primaryCta", "Main button", HERO_LIMITS.cta, `Empty keeps "${HERO_CTA_DEFAULTS.primary}".`, HERO_CTA_DEFAULTS.primary)}
          {text("secondaryCta", "Second button", HERO_LIMITS.cta, `Empty keeps "${HERO_CTA_DEFAULTS.secondary}".`, HERO_CTA_DEFAULTS.secondary)}
        </fieldset>

        <fieldset className="box grid min-w-0 gap-3 p-5">
          <legend className="mono px-2 font-bold">Show</legend>
          <Switch id={`${id}-stats`} checked={draft.showStats} onChange={(v) => set("showStats", v)} label="Numbers strip" hint="The row of figures at the bottom of the opening section." />
          <Switch id={`${id}-frame`} checked={draft.showFrameText} onChange={(v) => set("showFrameText", v)} label="Frame text" hint="The organiser name beside the diamond at the top of the frame." />
        </fieldset>
      </div>

      <div className="grid min-w-0 gap-4 lg:sticky lg:top-32">
        <section aria-labelledby={`${id}-pv`} className="min-w-0">
          <h2 id={`${id}-pv`} className="mono mb-2 font-bold">Preview (sample step and dates)</h2>
          <ScaledPreview draft={draft} base={preview} />
          <p className="mt-1.5 text-xs text-ink-3">Shown at desktop width, scaled down.</p>
        </section>

        <div className="grid gap-3">
          {error && !conflict && (
            <p ref={alertRef} tabIndex={-1} role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
              {error.message}
            </p>
          )}
          <p role="status" aria-live="polite" className={cn(status && "border-2 border-ink bg-paper-2 p-3 font-semibold")}>
            {status}
          </p>
          {conflict && (
            <button type="button" className="btn btn-secondary min-h-11 justify-self-start" onClick={() => window.location.reload()}>
              Reload the latest
            </button>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary min-h-11" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-secondary min-h-11" disabled={pending} onClick={() => setConfirmReset(true)}>
              Reset to defaults
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset the opening section?"
        description="This removes your saved look and words. The home page goes back to the original poster."
        confirmLabel="Reset to defaults"
        pending={pending}
        error={confirmReset ? error?.message ?? null : null}
        onConfirm={doReset}
      />
    </form>
  );
}
