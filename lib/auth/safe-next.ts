/** Accepts only same-origin relative paths; everything else becomes `fallback`. */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, "http://localhost");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://localhost") return fallback;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return fallback;
  }
  path = path.replace(/\/+$/, "").toLowerCase();
  if (/^\/(login|auth)(\/|$)/.test(path)) return fallback;
  const out = url.pathname + url.search + url.hash;
  // Dot-segments can collapse into "//host" or "/\\host" after URL parsing.
  if (/^\/[\/\\]/.test(out)) return fallback;
  return out;
}
