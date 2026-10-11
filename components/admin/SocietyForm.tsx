"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSocietyAction } from "@/lib/admin/content-actions";
import { SOCIETY_COLORS } from "@/lib/admin/content-schemas";
import type { AdminError } from "@/lib/admin/result";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { MediaUploader } from "./MediaUploader";

export interface SocietyIdentity {
  name: string;
  shortName: string;
  color: string;
  sortOrder: number;
}

/** Society page: description + logo for everyone who manages it; identity fields only for super admins. */
export function SocietyForm({
  societyId,
  updatedAt,
  description: initialDescription,
  logoUrl: initialLogo,
  identity: initialIdentity,
}: {
  societyId: string;
  updatedAt: string;
  description: string;
  logoUrl: string | null;
  /** Provided for super admins only. */
  identity?: SocietyIdentity;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [description, setDescription] = useState(initialDescription);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogo);
  const [identity, setIdentity] = useState<SocietyIdentity | undefined>(initialIdentity);
  const [error, setError] = useState<AdminError | null>(null);
  const [note, setNote] = useState("");
  const fe = error?.fieldErrors ?? {};

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNote("");
    start(async () => {
      const r = await saveSocietyAction({
        societyId,
        seenUpdatedAt: updatedAt,
        data: { description, logoUrl, ...(identity ? { identity } : {}) },
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNote("Saved.");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="box shadow-hard grid gap-5 p-5">
      {error && (
        <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
          {error.message}
        </p>
      )}
      <Field id={`${id}-desc`} label="Description" hint="Shown on the society page and the home page (max 600 characters)." error={fe.description}>
        <textarea
          id={`${id}-desc`}
          className={textareaCls}
          value={description}
          maxLength={600}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={fe.description ? true : undefined}
        />
      </Field>
      <div>
        <MediaUploader
          kind="logo"
          target={{ societyId }}
          label="Logo"
          currentUrl={logoUrl}
          onUploaded={setLogoUrl}
          disabled={pending}
        />
        {logoUrl && (
          <p className="mt-2 text-sm">
            Logo set.{" "}
            <button type="button" className="min-h-11 font-bold underline underline-offset-4" onClick={() => setLogoUrl(null)}>
              Remove logo
            </button>
          </p>
        )}
        {fe.logoUrl && <p role="alert" className="mt-1 text-sm font-semibold text-red-ink">{fe.logoUrl}</p>}
      </div>

      {identity && (
        <fieldset className="grid gap-4 border-2 border-ink p-4">
          <legend className="mono px-2 font-bold">Identity (super admin only)</legend>
          <Field id={`${id}-name`} label="Name" error={fe["identity.name"]}>
            <input id={`${id}-name`} className={inputCls} value={identity.name} maxLength={80} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} />
          </Field>
          <Field id={`${id}-short`} label="Short name" error={fe["identity.shortName"]}>
            <input id={`${id}-short`} className={inputCls} value={identity.shortName} maxLength={20} onChange={(e) => setIdentity({ ...identity, shortName: e.target.value })} />
          </Field>
          <Field id={`${id}-color`} label="Colour" error={fe["identity.color"]}>
            <select id={`${id}-color`} className={inputCls} value={identity.color} onChange={(e) => setIdentity({ ...identity, color: e.target.value })}>
              {SOCIETY_COLORS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field id={`${id}-order`} label="Order on the site" error={fe["identity.sortOrder"]}>
            <input
              id={`${id}-order`}
              className={inputCls}
              type="number"
              min={0}
              max={10000}
              value={identity.sortOrder}
              onChange={(e) => setIdentity({ ...identity, sortOrder: Number.parseInt(e.target.value, 10) || 0 })}
            />
          </Field>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save society page"}
        </button>
        <p aria-live="polite" className="text-sm font-semibold">
          {note}
        </p>
      </div>
    </form>
  );
}
