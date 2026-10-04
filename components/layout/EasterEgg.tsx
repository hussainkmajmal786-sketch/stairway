"use client";

import { useEffect, useState } from "react";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

/** Type "AI" anywhere (or the Konami code) to unlock the hidden step. */
export function EasterEgg() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let buf: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      buf = [...buf, e.key].slice(-10);
      if (buf.slice(-2).join("").toLowerCase() === "ai" || buf.join(",") === KONAMI.join(",")) {
        buf = [];
        setOn(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => setOn(false), 4000);
    return () => clearTimeout(id);
  }, [on]);

  if (!on) return null;
  return (
    <div role="status" className="fixed left-1/2 top-24 z-[70] w-[min(92vw,380px)] -translate-x-1/2 animate-[pop_0.3s_var(--ease)] border-2 border-ink bg-yellow p-5 shadow-[6px_6px_0_0_var(--ink)]">
      <p className="mono font-bold">Hidden step unlocked</p>
      <p className="mt-1 text-2xl font-semibold">Step 00: Curiosity</p>
      <p className="mt-1 text-sm text-ink-2">Every climber starts here. Show this to a volunteer for a sticker.</p>
    </div>
  );
}
