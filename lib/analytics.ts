// Tiny analytics shim. Works with GA4 (gtag) and Vercel Analytics (va)
// when either is present; silently no-ops otherwise.

type Props = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    va?: (event: "event", data: { name: string; data?: Props }) => void;
  }
}

export function track(name: string, props: Props = {}) {
  if (typeof window === "undefined") return;
  window.gtag?.("event", name, props);
  window.va?.("event", { name, data: props });
}

/** Ids in paths (e.g. /me/tickets/<registration id>) are stable per-user identifiers: never sent to analytics. */
export const ID_SEGMENT_SOURCE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** Path for analytics: id segments replaced by ":id". */
export function analyticsPath(pathname: string): string {
  return pathname.replace(new RegExp(ID_SEGMENT_SOURCE, "g"), ":id");
}

/** The only query keys sent to analytics (campaign attribution). Everything else (e.g. ?new=1) is dropped. */
export const ALLOWED_QUERY_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"] as const;

/** URL for analytics: origin + id-scrubbed path + allowlisted query keys only; no hash. "" if unparseable. */
export function scrubUrl(href: string): string {
  try {
    const u = new URL(href);
    const q = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if ((ALLOWED_QUERY_KEYS as readonly string[]).includes(k)) q.append(k, v);
    });
    const s = q.toString();
    return `${u.origin}${analyticsPath(u.pathname)}${s ? `?${s}` : ""}`;
  } catch {
    return "";
  }
}

/** Referrer for the first hit: a cross-origin referrer is kept as is, a same-origin one is scrubbed. */
export function scrubReferrer(referrer: string, origin: string): string {
  if (!referrer) return "";
  try {
    return new URL(referrer).origin === origin ? scrubUrl(referrer) : referrer;
  } catch {
    return "";
  }
}

export interface PageViewStep {
  /** Scrubbed location to remember for the next call. */
  prev: string;
  /** Hit to send, or null (first load: the bootstrap sent it; or nothing analytics-visible changed). */
  hit: { page_location: string; page_referrer: string } | null;
}

/** GaPageViews' decision for one client navigation (or query change) to `href`. */
export function pageViewStep(prev: string | null, href: string): PageViewStep {
  const loc = scrubUrl(href);
  if (prev === null || prev === loc) return { prev: loc, hit: null };
  return { prev: loc, hit: { page_location: loc, page_referrer: prev } };
}

// Plain-JS twin of scrubUrl/scrubReferrer for the inline bootstrap (tests check both agree).
const BOOT_SCRUB =
  "function s(h){try{var u=new URL(h),q=new URLSearchParams();" +
  "u.searchParams.forEach(function(v,k){if(A.indexOf(k)>=0)q.append(k,v)});var t=q.toString();" +
  "return u.origin+u.pathname.replace(new RegExp(I,'g'),':id')+(t?'?'+t:'')}catch(e){return ''}}" +
  "function r(h){if(!h)return '';try{return new URL(h).origin===location.origin?s(h):h}catch(e){return ''}}";

/**
 * Inline gtag bootstrap. The automatic page_view is off; the config carries the scrubbed page_location and
 * page_referrer, so every hit (page views, share events, enhanced-measurement clicks) inherits them instead of the raw
 * URL. GaPageViews `set`s them again on each client navigation. GA4's enhanced-measurement "page changes based on
 * browser history events" must stay off in the stream settings, or GA would also send raw URLs.
 */
export function gaBootstrap(gaId: string): string {
  // JSON string literals, with "<" escaped so a stored value can never close the <script>.
  const lit = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
  return (
    "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;" +
    `(function(){var A=${lit(ALLOWED_QUERY_KEYS)},I=${lit(ID_SEGMENT_SOURCE)};${BOOT_SCRUB}` +
    "var L=s(location.href),R=r(document.referrer);" +
    `gtag('js',new Date());gtag('config',${lit(gaId)},{send_page_view:false,page_location:L,page_referrer:R});` +
    "gtag('event','page_view',{page_location:L,page_referrer:R});})();"
  );
}
