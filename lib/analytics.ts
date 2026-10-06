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

/** Path for analytics: id segments replaced by ":id", no query string or hash (they can carry state like ?new=1). */
export function analyticsPath(pathname: string): string {
  return pathname.replace(new RegExp(ID_SEGMENT_SOURCE, "g"), ":id");
}

/**
 * Inline gtag bootstrap. The automatic page_view is off: every page_view (the first one here, later ones from
 * GaPageViews) is sent with the scrubbed path. GA4's enhanced-measurement "page changes based on browser history
 * events" must stay off in the stream settings, or GA would also send raw URLs.
 */
export function gaBootstrap(gaId: string): string {
  // JSON string literal, with "<" escaped so a stored value can never close the <script>.
  const id = JSON.stringify(gaId).replace(/</g, "\\u003c");
  return (
    "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;" +
    `gtag('js',new Date());gtag('config',${id},{send_page_view:false});` +
    `var p=location.pathname.replace(new RegExp(${JSON.stringify(ID_SEGMENT_SOURCE)},'g'),':id');` +
    "gtag('event','page_view',{page_location:location.origin+p,page_path:p,page_referrer:''});"
  );
}
