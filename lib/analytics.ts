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
