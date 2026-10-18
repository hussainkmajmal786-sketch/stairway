// Pure upload rules: what may be uploaded, where it goes, and which stored URLs are acceptable.
// No SVG anywhere: the bucket is public and SVGs can carry scripts.

export const MEDIA_KINDS = ["poster", "gallery", "logo", "speaker", "sponsor", "team", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const MB = 1024 * 1024;
const IMAGE = { mimes: ["image/png", "image/jpeg", "image/webp", "image/avif"] as readonly string[], maxBytes: 5 * MB };
const VIDEO = { mimes: ["video/mp4", "video/webm"] as readonly string[], maxBytes: 100 * MB };

export const MEDIA_LIMITS: Record<MediaKind, { mimes: readonly string[]; maxBytes: number }> = {
  poster: IMAGE,
  gallery: IMAGE,
  logo: IMAGE,
  speaker: IMAGE,
  sponsor: IMAGE,
  team: IMAGE,
  video: VIDEO,
};

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RAND = /^[0-9a-f]{32}$/;

export type MediaScope = { societyId: string; eventId?: string } | { site: true };

/** Reason an upload is refused before any storage call, or null when the declared type and size are acceptable. */
export function checkUpload(kind: MediaKind, mime: string, size: number): string | null {
  const limit = MEDIA_LIMITS[kind];
  if (!limit) return "Unknown upload type.";
  if (!limit.mimes.includes(mime)) {
    const names = limit.mimes.map((m) => m.split("/")[1].toUpperCase()).join(", ");
    return `That file type is not allowed. Use ${names}.`;
  }
  if (!Number.isFinite(size) || size <= 0) return "The file is empty.";
  if (size > limit.maxBytes) return `That file is too large (max ${Math.round(limit.maxBytes / MB)} MB).`;
  return null;
}

/**
 * Storage path for a new object. The file name and extension come from `kind`, the validated MIME and a random id,
 * never from anything the browser called the file.
 */
export function mediaPath(opts: { scope: MediaScope; kind: MediaKind; mime: string; rand: string }): string {
  const ext = EXT[opts.mime];
  if (!ext || !MEDIA_LIMITS[opts.kind]) throw new Error("unsupported media type");
  if (!RAND.test(opts.rand)) throw new Error("invalid random id");
  const file = `${opts.kind}-${opts.rand}.${ext}`;
  const s = opts.scope;
  if ("site" in s) return `site/${file}`;
  if (!UUID.test(s.societyId)) throw new Error("invalid society id");
  if (s.eventId === undefined) return `societies/${s.societyId}/${file}`;
  if (!UUID.test(s.eventId)) throw new Error("invalid event id");
  return `societies/${s.societyId}/events/${s.eventId}/${file}`;
}

/**
 * Whether `url` is an object in this project's public `media` bucket under `allowedPrefix` (a folder path such as
 * `societies/<id>/events/<id>/`). https only, exact host, no credentials, query, fragment or path tricks.
 */
export function isOwnMediaUrl(url: string, supabaseUrl: string, allowedPrefix: string): boolean {
  if (typeof url !== "string" || url.length === 0 || url.length > 600) return false;
  // Raw-string checks first: URL parsing normalises "..", which would hide the attempt.
  if (/\.\.|%2e|%2f|%5c|\\|[\u0000-\u001f]/i.test(url)) return false;
  let u: URL;
  let base: URL;
  try {
    u = new URL(url);
    base = new URL(supabaseUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || base.protocol !== "https:") return false;
  if (u.username !== "" || u.password !== "") return false;
  if (u.host !== base.host) return false;
  if (u.search !== "" || u.hash !== "") return false;
  const prefix = allowedPrefix.endsWith("/") ? allowedPrefix : `${allowedPrefix}/`;
  if (prefix.includes("..") || prefix.startsWith("/")) return false;
  const full = `/storage/v1/object/public/media/${prefix}`;
  // A file directly inside the allowed folder (no nested folders, so one event cannot point into another).
  return u.pathname.startsWith(full) && /^[A-Za-z0-9._-]+$/.test(u.pathname.slice(full.length));
}
