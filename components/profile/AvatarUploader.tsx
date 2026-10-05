"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { cropToSquareWebp } from "@/lib/profile/crop";
import { Avatar } from "@/components/ui/Avatar";

const MAX_BYTES = 8 * 1024 * 1024;

/** Picks an image, centre-crops it to a 512px WebP and uploads it to the user's own avatar folder. */
export function AvatarUploader({
  userId, currentUrl, name, onUploaded,
}: { userId: string; currentUrl: string | null; name: string; onUploaded: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  // Path of the last file uploaded in this session (not yet saved to the profile), so a re-pick can clean it up.
  const pending = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    if (file.size > MAX_BYTES) return setError("That image is over 8 MB — pick a smaller one.");
    setBusy(true);
    setError(null);
    try {
      const blob = await cropToSquareWebp(file);
      const supabase = createClient();
      const path = `${userId}/avatar-${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/webp",
        cacheControl: "31536000",
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Best effort: drop the previous unsaved upload; the saved avatar stays until the profile changes.
      if (pending.current) void supabase.storage.from("avatars").remove([pending.current]);
      pending.current = path;
      setPreview(data.publicUrl);
      onUploaded(data.publicUrl);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || "You"} photo={preview ?? undefined} size={88} />
      <div>
        <input ref={input} type="file" accept="image/*" className="sr-only" id="avatar-input" tabIndex={-1} onChange={pick} />
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Camera size={16} strokeWidth={2} aria-hidden />}
          {preview ? "Change photo" : "Add photo"}
        </button>
        <p role="status" aria-live="polite" className="mt-2 text-xs font-semibold text-red-ink">{error}</p>
        <p className="mt-1 text-xs text-ink-3">Square crops look best. Max 8 MB.</p>
      </div>
    </div>
  );
}
