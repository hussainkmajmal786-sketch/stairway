"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Field } from "@/components/ui/Field";

export const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

/** Chooses an image and previews it locally (object URL, revoked on change). The upload itself happens in ClaimForm. */
export function ProofPicker({
  file, onChange, disabled,
}: {
  file: File | null; onChange: (f: File | null) => void; disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const current = useRef<string | null>(null);

  // Revoke the last object URL when the picker unmounts (no state is set here).
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current); }, []);

  function setUrl(next: string | null) {
    if (current.current) URL.revokeObjectURL(current.current);
    current.current = next;
    setPreview(next);
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (!(PROOF_TYPES as readonly string[]).includes(f.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (f.size > PROOF_MAX_BYTES) {
      setError("That image is over 5 MB. Choose a smaller one.");
      return;
    }
    setError(undefined);
    setUrl(URL.createObjectURL(f));
    onChange(f);
  }

  return (
    <Field id={id} label="Photo or screenshot of your IEEE card" error={error} hint="JPG, PNG or WebP, up to 5 MB.">
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : `${id}-hint`}
        className="block w-full border-2 border-ink bg-white p-3 text-sm file:mr-3 file:border-2 file:border-ink file:bg-yellow file:px-3 file:py-2 file:font-mono file:text-xs file:font-bold file:uppercase"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {preview && file && (
        <div className="mt-3 flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL preview cannot use next/image */}
          <img src={preview} alt="Preview of the card image you chose" className="max-h-48 max-w-full border-2 border-ink bg-white object-contain" />
          <button type="button" className="btn btn-sm btn-secondary" disabled={disabled} onClick={() => { setUrl(null); onChange(null); }}>
            <X size={14} strokeWidth={2} aria-hidden /> Remove
          </button>
        </div>
      )}
      {!preview && (
        <p className="mt-2 flex items-center gap-2 text-xs text-ink-3">
          <ImagePlus size={14} aria-hidden /> No image chosen yet.
        </p>
      )}
    </Field>
  );
}
