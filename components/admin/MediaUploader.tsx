"use client";

import { useId, useState } from "react";
import { Upload } from "lucide-react";
import { prepareUploadAction } from "@/lib/admin/media-actions";
import { checkUpload, MEDIA_LIMITS, type MediaKind } from "@/lib/admin/media";
import { createClient } from "@/lib/supabase/browser";

export type UploadTarget = { eventId: string } | { societyId: string } | { site: true };

/**
 * File picker that uploads straight to Storage with a server-issued signed upload token. The browser never
 * chooses the path; the server authorises, validates type and size, and picks an unguessable name.
 */
export function MediaUploader({
  kind,
  target,
  label,
  currentUrl,
  onUploaded,
  disabled,
}: {
  kind: MediaKind;
  target: UploadTarget;
  label: string;
  currentUrl?: string | null;
  onUploaded: (publicUrl: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const accept = MEDIA_LIMITS[kind].mimes.join(",");
  const names = MEDIA_LIMITS[kind].mimes.map((m) => m.split("/")[1].toUpperCase()).join(", ");
  const maxMb = Math.round(MEDIA_LIMITS[kind].maxBytes / (1024 * 1024));

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setError("");
    setDone("");
    const problem = checkUpload(kind, file.type, file.size);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const prepared = await prepareUploadAction({ target, kind, mime: file.type, size: file.size });
      if (!prepared.ok) {
        setError(prepared.error.message);
        return;
      }
      const { error: upError } = await createClient()
        .storage.from("media")
        .uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType: file.type });
      if (upError) {
        setError("The upload failed. Check your connection and try again.");
        return;
      }
      setDone("Uploaded.");
      onUploaded(prepared.data.publicUrl);
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="mono block font-bold">
        {label}
      </label>
      {currentUrl && kind !== "video" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt="" className="max-h-48 w-auto max-w-full border-2 border-ink object-contain" />
      )}
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled || busy}
        onChange={onPick}
        aria-describedby={`${id}-hint ${error ? `${id}-err` : ""}`.trim()}
        className="min-h-12 w-full border-2 border-ink bg-white p-2"
      />
      <p id={`${id}-hint`} className="text-xs text-ink-3">
        {names}, up to {maxMb} MB.
      </p>
      {busy && (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Upload size={16} strokeWidth={2} aria-hidden /> <progress aria-label="Uploading" className="h-3 w-40" /> Uploading…
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="border-2 border-red-ink bg-error-bg p-2 text-sm font-semibold text-red-ink">
          {error}
        </p>
      )}
      <p aria-live="polite" className="text-sm font-semibold">
        {done}
      </p>
    </div>
  );
}
