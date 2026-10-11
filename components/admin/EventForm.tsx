"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventAction, updateEventAction } from "@/lib/admin/event-actions";
import {
  EventFieldsSchema, formValuesToFields, LEVELS, MODES, rupeesToPaise, slugify, TICKET_TYPES,
  type EventFormValues,
} from "@/lib/admin/event-schema";
import { Field, fieldDescribedBy, inputCls, textareaCls } from "@/components/ui/Field";

export interface TrackOption {
  id: string;
  name: string;
  societyId: string;
}
export interface SocietyOption {
  id: string;
  name: string;
}

// Server field id -> form control id (the schema uses API names; the form uses its own).
const CONTROL: Record<string, keyof EventFormValues> = {
  startsAt: "startsLocal",
  endsAt: "endsLocal",
  pricePaise: "priceRupees",
  registrationOpensAt: "regOpensLocal",
  registrationClosesAt: "regClosesLocal",
};
const ctl = (serverKey: string) => (CONTROL[serverKey] ?? serverKey) as keyof EventFormValues;

export const EMPTY_VALUES: EventFormValues = {
  trackId: "", step: "1", slug: "", title: "", topic: "", summary: "", description: "", startsLocal: "", endsLocal: "",
  venue: "", mode: "offline", level: "All levels", formats: "", capacity: "60", priceRupees: "0", ticketType: "qr",
  tokenPrefix: "", regOpensLocal: "", regClosesLocal: "", isFinale: false,
};

type Props =
  | { mode: "create"; societies: SocietyOption[]; tracks: TrackOption[]; initial: EventFormValues; isSuper: boolean }
  | {
      mode: "edit";
      eventId: string;
      updatedAt: string;
      tracks: TrackOption[];
      initial: EventFormValues;
      isSuper: boolean;
      locks: { price: boolean; ticket: boolean; slug: boolean };
      societyId: string;
    };

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function EventForm(props: Props) {
  const router = useRouter();
  const [values, setValues] = useState<EventFormValues>(props.initial);
  const [saved, setSaved] = useState<EventFormValues>(props.initial);
  const [societyId, setSocietyId] = useState(props.mode === "create" ? (props.societies[0]?.id ?? "") : props.societyId);
  const [slugTouched, setSlugTouched] = useState(props.mode === "edit");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState("");
  const [pending, start] = useTransition();
  const [seen, setSeen] = useState(props.mode === "edit" ? props.updatedAt : "");
  const [lastProp, setLastProp] = useState(props.mode === "edit" ? props.updatedAt : "");
  const formRef = useRef<HTMLFormElement>(null);
  const [focusTick, setFocusTick] = useState(0);

  // A newer server `updated_at` (after a lifecycle action elsewhere on the page) replaces our token, not our edits.
  if (props.mode === "edit" && props.updatedAt !== lastProp) {
    setLastProp(props.updatedAt);
    setSeen(props.updatedAt);
  }

  const dirty = !sameJson(values, saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Move focus to the first invalid control after an error render.
  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const tracksForSociety = props.tracks.filter((t) => t.societyId === societyId);
  const locks = props.mode === "edit" ? props.locks : { price: false, ticket: false, slug: false };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    const local: Record<string, string> = {};
    if (rupeesToPaise(values.priceRupees) === null) local.priceRupees = "Enter an amount in rupees, like 199 or 199.50.";
    const fields = formValuesToFields(values);
    const parsed = EventFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = ctl(String(issue.path[0] ?? "title"));
        if (!(key in local)) local[key] = issue.message;
      }
    }
    if (props.mode === "create" && !societyId) local.societyId = "Choose a society.";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setSummary("Some fields need attention.");
      setFocusTick((n) => n + 1);
      return;
    }
    setErrors({});
    setSummary("");
    start(async () => {
      if (props.mode === "create") {
        const r = await createEventAction({ societyId, ...fields });
        if (r.ok) {
          setSaved(values);
          router.push(`/admin/events/${r.data.id}`);
          return;
        }
        return fail(r.error);
      }
      const r = await updateEventAction({ id: props.eventId, seenUpdatedAt: seen, ...fields });
      if (r.ok) {
        setSeen(r.data.updatedAt);
        setSaved(values);
        setStatus("Saved.");
        router.refresh();
        return;
      }
      fail(r.error);
    });
  }

  function fail(error: { message: string; fieldErrors?: Record<string, string> }) {
    const mapped: Record<string, string> = {};
    for (const [k, msg] of Object.entries(error.fieldErrors ?? {})) mapped[ctl(k.split(".")[0])] = msg;
    setErrors(mapped);
    setSummary(error.message);
    setFocusTick((n) => n + 1);
  }

  const err = (k: keyof EventFormValues) => errors[k];
  const props_ = (k: keyof EventFormValues, hint?: string) => ({
    id: `ev-${k}`,
    "aria-invalid": err(k) ? (true as const) : undefined,
    "aria-describedby": fieldDescribedBy(`ev-${k}`, { error: err(k), hint }),
  });
  const text = (k: keyof EventFormValues, label: string, opts: { hint?: string; required?: boolean; disabled?: boolean; type?: string } = {}) => (
    <Field id={`ev-${k}`} label={label} error={err(k)} hint={opts.hint} required={opts.required}>
      <input
        {...props_(k, opts.hint)}
        type={opts.type ?? "text"}
        className={inputCls}
        value={String(values[k])}
        disabled={opts.disabled || pending}
        onChange={(e) => set(k, e.target.value as never)}
      />
    </Field>
  );

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="grid gap-8" aria-describedby="ev-form-alert">
      <div id="ev-form-alert" role="alert" className={summary ? "border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink" : "sr-only"}>
        {summary}
      </div>

      <fieldset className="grid gap-4 border-2 border-ink p-5">
        <legend className="mono px-2 font-bold">Basics</legend>
        {props.mode === "create" && (
          <Field id="ev-societyId" label="Society" error={err("societyId" as never)} required>
            <select
              id="ev-societyId"
              className={inputCls}
              value={societyId}
              disabled={pending}
              onChange={(e) => {
                setSocietyId(e.target.value);
                set("trackId", "");
              }}
            >
              {props.societies.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field id="ev-title" label="Title" error={err("title")} required>
          <input
            {...props_("title")}
            className={inputCls}
            value={values.title}
            disabled={pending}
            onChange={(e) => {
              const title = e.target.value;
              setValues((v) => ({ ...v, title, slug: slugTouched ? v.slug : slugify(title) }));
            }}
          />
        </Field>
        <Field
          id="ev-slug"
          label="Web address"
          error={err("slug")}
          hint={locks.slug ? "Locked: the address cannot change after publishing." : "Used in the page link, like /events/intro-to-rag."}
          required
        >
          <input
            {...props_("slug", locks.slug ? "x" : "y")}
            className={inputCls}
            value={values.slug}
            disabled={pending || locks.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
          />
        </Field>
        {text("topic", "Topic", { required: true })}
        <Field id="ev-summary" label="Summary" error={err("summary")} hint="One or two sentences for cards (max 300).">
          <textarea
            {...props_("summary", "x")}
            className={textareaCls}
            value={values.summary}
            disabled={pending}
            onChange={(e) => set("summary", e.target.value)}
          />
        </Field>
        <Field id="ev-description" label="Description" error={err("description")}>
          <textarea {...props_("description")} className={`${textareaCls} min-h-48`} value={values.description} disabled={pending} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ev-level" label="Level" error={err("level")}>
            <select {...props_("level")} className={inputCls} value={values.level} disabled={pending} onChange={(e) => set("level", e.target.value as EventFormValues["level"])}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
          <Field id="ev-mode" label="Mode" error={err("mode")}>
            <select {...props_("mode")} className={inputCls} value={values.mode} disabled={pending} onChange={(e) => set("mode", e.target.value as EventFormValues["mode"])}>
              {MODES.map((m) => (
                <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>
              ))}
            </select>
          </Field>
        </div>
        {text("formats", "Formats", { hint: "Comma separated, up to 8, like Workshop, Talk." })}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ev-trackId" label="Track" error={err("trackId")}>
            <select {...props_("trackId")} className={inputCls} value={values.trackId} disabled={pending} onChange={(e) => set("trackId", e.target.value)}>
              <option value="">No track</option>
              {tracksForSociety.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
          {text("step", "Step number", { required: true, hint: "Unique within the society." })}
        </div>
        {props.isSuper && (
          <label className="flex min-h-11 items-center gap-3 font-semibold">
            <input type="checkbox" className="h-5 w-5" checked={values.isFinale} disabled={pending} onChange={(e) => set("isFinale", e.target.checked)} />
            Finale session
          </label>
        )}
      </fieldset>

      <fieldset className="grid gap-4 border-2 border-ink p-5">
        <legend className="mono px-2 font-bold">Schedule</legend>
        <p className="text-sm text-ink-3">Times are Asia/Kolkata.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("startsLocal", "Starts", { type: "datetime-local", required: true })}
          {text("endsLocal", "Ends", { type: "datetime-local", required: true })}
        </div>
        {text("venue", "Venue", { hint: values.mode === "online" ? "Optional for online sessions." : "Required for in-person and hybrid sessions." })}
      </fieldset>

      <fieldset className="grid gap-4 border-2 border-ink p-5">
        <legend className="mono px-2 font-bold">Seats and price</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("capacity", "Capacity", { required: true })}
          {text("priceRupees", "Price (₹)", {
            hint: locks.price ? "Locked: someone already has a paid seat." : "0 for a free session.",
            disabled: locks.price,
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ev-ticketType" label="Ticket type" error={err("ticketType")} hint={locks.ticket ? "Locked: tickets have been issued." : undefined}>
            <select {...props_("ticketType", locks.ticket ? "x" : undefined)} className={inputCls} value={values.ticketType} disabled={pending || locks.ticket} onChange={(e) => set("ticketType", e.target.value as EventFormValues["ticketType"])}>
              {TICKET_TYPES.map((t) => (
                <option key={t} value={t}>{t === "qr" ? "QR code" : "Token number"}</option>
              ))}
            </select>
          </Field>
          {text("tokenPrefix", "Token prefix", { hint: "Capital letters, digits or hyphens (token tickets).", disabled: locks.ticket })}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 border-2 border-ink p-5">
        <legend className="mono px-2 font-bold">Registration window</legend>
        <p className="text-sm text-ink-3">Leave empty for always open until the session ends.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("regOpensLocal", "Opens", { type: "datetime-local" })}
          {text("regClosesLocal", "Closes", { type: "datetime-local" })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={pending || (props.mode === "edit" && !dirty)}>
          {pending ? "Saving…" : props.mode === "create" ? "Create draft" : "Save changes"}
        </button>
        {dirty && props.mode === "edit" && <span className="text-sm text-ink-3">Unsaved changes</span>}
        <p aria-live="polite" className="text-sm font-semibold">{status}</p>
      </div>
    </form>
  );
}
