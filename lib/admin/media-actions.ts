"use server";

import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { authorize, type Scope } from "./auth";
import { checkUpload, isOwnMediaUrl, mediaPath, MEDIA_KINDS, type MediaKind, type MediaScope } from "./media";
import { SeenUpdatedAt } from "./event-schema";
import { revalidateEventPaths } from "./revalidate";
import { fail, fromZod, mapDbError, okResult, type ActionResult } from "./result";
import { parseVideoUrl } from "./video";

const CONFLICT_MESSAGE = "Someone else changed this session. Reload to see their changes.";

// Which kinds of file each kind of target may receive.
const KINDS_FOR = {
  event: ["poster", "video", "gallery"],
  society: ["logo", "gallery", "speaker"],
  site: ["sponsor", "team", "gallery", "logo", "speaker", "poster", "video"],
} as const satisfies Record<string, readonly MediaKind[]>;

const PrepareSchema = z.strictObject({
  target: z.union([
    z.strictObject({ eventId: z.uuid() }),
    z.strictObject({ societyId: z.uuid() }),
    z.strictObject({ site: z.literal(true) }),
  ]),
  kind: z.enum(MEDIA_KINDS),
  mime: z.string().max(100),
  size: z.number().int().positive(),
});

/** The scope to authorise, read defensively from the raw input (it is validated properly afterwards). */
function scopeOf(input: unknown): Scope {
  const t = input && typeof input === "object" ? (input as { target?: unknown }).target : null;
  if (t && typeof t === "object") {
    const o = t as Record<string, unknown>;
    if (typeof o.eventId === "string") return { kind: "event", eventId: o.eventId };
    if (typeof o.societyId === "string") return { kind: "society", societyId: o.societyId };
    if (o.site === true) return { kind: "super" };
  }
  return { kind: "any" };
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Issues a signed upload token for one object. The action authorises, validates the declared type and size, and
 * chooses the (unguessable) path itself; storage RLS (`can_manage_media`) is still the real gate on the upload.
 */
export async function prepareUploadAction(
  input: unknown,
): Promise<ActionResult<{ path: string; token: string; publicUrl: string }>> {
  const auth = await authorize(scopeOf(input));
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = PrepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const { target, kind, mime, size } = parsed.data;

  let scope: MediaScope;
  let allowed: readonly MediaKind[];
  let targetId: string;
  if ("eventId" in target) {
    // Folder comes from the row's society, never from the request.
    if (!auth.societyId) return fail("forbidden");
    scope = { societyId: auth.societyId, eventId: target.eventId };
    allowed = KINDS_FOR.event;
    targetId = target.eventId;
  } else if ("societyId" in target) {
    scope = { societyId: target.societyId };
    allowed = KINDS_FOR.society;
    targetId = target.societyId;
  } else {
    scope = { site: true };
    allowed = KINDS_FOR.site;
    targetId = "site";
  }
  if (!allowed.includes(kind)) return fail("invalid_input", "That kind of file cannot be uploaded here.");
  const problem = checkUpload(kind, mime, size);
  if (problem) return fail("invalid_input", problem, { file: problem });

  const path = mediaPath({ scope, kind, mime, rand: randomHex(16) });
  const bucket = auth.db.storage.from("media");
  const signed = await bucket.createSignedUploadUrl(path);
  if (signed.error || !signed.data) return { ok: false, error: mapDbError(signed.error as { message?: string } | null) };

  const societyId = "site" in scope ? null : scope.societyId;
  const { error: logError } = await auth.db.rpc("log_admin_event", {
    p_action: "media.upload",
    p_target_type: `media.${kind}`,
    p_target_id: targetId,
    p_society_id: societyId as string,
    p_summary: { size },
  });
  if (logError) return { ok: false, error: mapDbError(logError) };

  return okResult({ path, token: signed.data.token, publicUrl: bucket.getPublicUrl(path).data.publicUrl });
}

const AttachSchema = z.strictObject({
  eventId: z.uuid(),
  field: z.enum(["poster", "video"]),
  url: z.string().max(600),
  seenUpdatedAt: SeenUpdatedAt,
});

/** Stores a poster (own-bucket URL under the event's folder) or a video (https YouTube/Vimeo/.mp4/.webm). "" clears. */
export async function attachEventMediaAction(input: unknown): Promise<ActionResult<{ url: string | null; updatedAt: string }>> {
  const raw = input && typeof input === "object" ? (input as { eventId?: unknown }).eventId : "";
  const auth = await authorize({ kind: "event", eventId: typeof raw === "string" ? raw : "" });
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = AttachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: fromZod(parsed.error) };
  const { eventId, field, seenUpdatedAt } = parsed.data;
  const url = parsed.data.url.trim();

  let value: string | null = null;
  if (url !== "") {
    if (field === "poster") {
      const prefix = `societies/${auth.societyId}/events/${eventId}/`;
      if (!isOwnMediaUrl(url, publicEnv.supabaseUrl, prefix)) {
        return fail("invalid_input", "The poster must be an image uploaded for this session.", { url: "Upload the image with the uploader." });
      }
      value = url;
    } else {
      const v = parseVideoUrl(url);
      if (!v) {
        return fail("invalid_input", "Use a YouTube, Vimeo or direct .mp4/.webm https link.", {
          url: "Use a YouTube, Vimeo or direct .mp4/.webm https link.",
        });
      }
      value = v.url;
    }
  }

  const column = field === "poster" ? { poster_url: value } : { video_url: value };
  const { data, error } = await auth.db
    .from("events")
    .update(column)
    .eq("id", eventId)
    .eq("updated_at", seenUpdatedAt)
    .select("id, slug, status, society_id, updated_at");
  if (error) return { ok: false, error: mapDbError(error) };
  if (!data || data.length === 0) return fail("conflict", CONFLICT_MESSAGE);
  const row = data[0];
  await revalidateEventPaths(auth.db, { slug: row.slug, societyId: row.society_id, published: row.status === "published", eventId });
  return okResult({ url: value, updatedAt: row.updated_at });
}
