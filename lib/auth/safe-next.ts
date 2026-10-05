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
  if (url.pathname === "/login" || url.pathname.startsWith("/auth/")) return fallback;
  return url.pathname + url.search + url.hash;
}
