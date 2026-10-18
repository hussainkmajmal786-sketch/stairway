"use client";

import { useRef } from "react";
import { KINDS, nextTabIndex, type FormKind } from "@/lib/community/form-ui";
import { cn } from "@/lib/utils";

/** Automatic-activation tablist (WAI-ARIA tabs pattern): roving tabindex, arrows/Home/End, no animation. */
export function KindTabs({ value, onChange, idPrefix }: { value: FormKind; onChange: (k: FormKind) => void; idPrefix: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      role="tablist"
      aria-label="How would you like to get involved?"
      className="grid gap-2 sm:grid-cols-3"
      onKeyDown={(e) => {
        const i = KINDS.findIndex((k) => k.kind === value);
        const n = nextTabIndex(e.key, i, KINDS.length);
        if (n === null) return;
        e.preventDefault();
        onChange(KINDS[n].kind);
        refs.current[n]?.focus();
      }}
    >
      {KINDS.map((k, i) => {
        const selected = k.kind === value;
        return (
          <button
            key={k.kind}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${k.kind}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${k.kind}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(k.kind)}
            className={cn(
              "min-h-12 border-2 border-ink px-4 py-2 text-left font-mono text-xs font-bold uppercase tracking-[0.12em] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink",
              selected ? "bg-field text-paper shadow-[3px_3px_0_0_var(--ink)]" : "bg-paper text-ink hover:bg-yellow",
            )}
          >
            {k.label}
          </button>
        );
      })}
    </div>
  );
}
