import type { ImageResponse } from "next/og";

type OgFontList = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

/** How long loading one font (css + TTF) may take before the card falls back to the built-in font. */
const FETCH_TIMEOUT_MS = 2500;
/** Subsets already fetched by this isolate/process, keyed by family + glyph set (bounded so it can't grow forever). */
const cache = new Map<string, ArrayBuffer>();
const CACHE_MAX = 64;

/** Font files are only ever fetched from Google's font CDN, whatever the css response says. */
const FONT_HOST = "https://fonts.gstatic.com/";

/** The first TrueType/OpenType URL in a Google Fonts css2 response (Satori can't read woff2), if it is on fonts.gstatic.com. */
export function ttfUrlFromCss(css: string): string | null {
  const m = /src:\s*url\(([^)]+)\)\s*format\(['"](?:opentype|truetype)['"]\)/.exec(css);
  const url = m ? m[1].replace(/^['"]|['"]$/g, "") : null;
  return url && url.startsWith(FONT_HOST) ? url : null;
}

let warned = false;
/** One line in the build log (and once per Worker isolate) when a card falls back to the built-in font. */
function warnFallbackOnce(family: string) {
  if (warned) return;
  warned = true;
  console.warn(`[og-font] could not load "${family}" from Google Fonts; OG images/icons use the built-in font`);
}

/**
 * A Google font subset (only `text`'s glyphs) as TTF for next/og. Fetched inside the Worker at request time:
 * node:fs (the Next docs' readFile example) does not exist on Cloudflare. Null on any failure or timeout; never throws.
 */
export async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  const glyphs = [...new Set(text)].sort().join("");
  const key = `${family}|${glyphs}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Whole-load deadline (both requests and both bodies); resolves null even if the runtime ignores the abort.
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve(null);
    }, FETCH_TIMEOUT_MS);
  });
  const load = async (): Promise<ArrayBuffer | null> => {
    const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}&text=${encodeURIComponent(glyphs)}`;
    const cssRes = await fetch(url, { signal: ctrl.signal });
    if (!cssRes.ok) return null;
    const src = ttfUrlFromCss(await cssRes.text());
    if (!src) return null;
    const res = await fetch(src, { signal: ctrl.signal });
    return res.ok ? await res.arrayBuffer() : null;
  };
  try {
    const data = await Promise.race([load(), deadline]);
    if (data) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, data);
    } else warnFallbackOnce(family);
    return data;
  } catch {
    warnFallbackOnce(family);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Anton (display) + Space Mono 700 (labels), or undefined so the whole card uses the built-in font if either fails. */
export async function ogFonts(text: { display: string; mono: string }): Promise<OgFontList> {
  const [display, mono] = await Promise.all([loadGoogleFont("Anton", text.display), loadGoogleFont("Space Mono:wght@700", text.mono)]);
  if (!display || !mono) return undefined;
  return [
    { name: "Anton", data: display, weight: 400, style: "normal" },
    { name: "Space Mono", data: mono, weight: 700, style: "normal" },
  ];
}
