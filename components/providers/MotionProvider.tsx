"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Calm motion layer: elements with [data-reveal] fade up once when they
 * enter the viewport, and focus moves to the new page after navigation.
 * Scrolling is native (CSS smooth scroll, off under reduced motion).
 */
export function MotionProvider() {
  const pathname = usePathname();

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    const scan = () => document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => io.observe(el));
    scan();
    let t: ReturnType<typeof setTimeout>;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(scan, 60);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      clearTimeout(t);
    };
  }, []);

  // after client navigation, hand focus to the new content for keyboard / screen-reader users
  const first = useRef(true);
  useEffect(() => {
    if (!first.current && !location.hash) document.getElementById("main")?.focus({ preventScroll: true });
    first.current = false;
  }, [pathname]);

  return null;
}
