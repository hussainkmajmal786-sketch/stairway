"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Live media-query match. Returns `serverValue` during SSR and hydration. */
export function useMediaQuery(query: string, serverValue = false) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    () => serverValue,
  );
}

export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

const noopSubscribe = () => () => {};

/** Reads a value that only exists in the browser (DOM, storage) without hydration mismatches. */
export function useClientValue<T>(read: () => T, serverValue: T) {
  return useSyncExternalStore(noopSubscribe, read, () => serverValue);
}

export function readStorage(key: string, store: "local" | "session" = "local") {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
