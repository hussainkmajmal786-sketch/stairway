// Pure parser for the event video field. https only; YouTube, Vimeo or a direct .mp4/.webm file.
// Anything else (http:, javascript:, data:, other hosts, extra tracking/playlist params on embeds) is rejected.

export type VideoKind = "youtube" | "vimeo" | "direct";
export interface ParsedVideo {
  kind: VideoKind;
  url: string;
}

const MAX_LENGTH = 500;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
// Harmless extras people paste with a watch link; anything else (list, index, ...) is refused.
const YT_WATCH_EXTRAS = new Set(["v", "t", "si", "start", "feature"]);
const YT_SHORT_EXTRAS = new Set(["t", "si"]);

const onlyKeys = (url: URL, allowed: ReadonlySet<string>) => [...url.searchParams.keys()].every((k) => allowed.has(k));

export function parseVideoUrl(raw: string): ParsedVideo | null {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (input === "" || input.length > MAX_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (YT_HOSTS.has(host)) {
    let id: string | null = null;
    if (path === "/watch") {
      if (!onlyKeys(url, YT_WATCH_EXTRAS)) return null;
      id = url.searchParams.get("v");
    } else {
      const m = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(path);
      if (m && [...url.searchParams.keys()].length === 0) id = m[1];
    }
    return id && YT_ID.test(id) ? { kind: "youtube", url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host === "youtu.be") {
    const m = /^\/([A-Za-z0-9_-]{11})$/.exec(path);
    if (!m || !onlyKeys(url, YT_SHORT_EXTRAS)) return null;
    return { kind: "youtube", url: `https://www.youtube.com/watch?v=${m[1]}` };
  }
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    const m = /^\/(\d{5,12})$/.exec(path);
    if (!m || [...url.searchParams.keys()].length !== 0) return null;
    return { kind: "vimeo", url: `https://vimeo.com/${m[1]}` };
  }
  // Direct file: the path must end in .mp4 / .webm. Any other host is allowed (it is just a media element source).
  if (/\.(mp4|webm)$/i.test(path) && !/(^|\.)(youtube|youtu|vimeo)\.[a-z]+$/.test(host)) {
    return { kind: "direct", url: url.toString() };
  }
  return null;
}
