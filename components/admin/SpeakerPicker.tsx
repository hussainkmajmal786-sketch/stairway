"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { moveItem } from "@/lib/admin/questions-builder";

export interface SpeakerOption {
  id: string;
  name: string;
  detail: string;
}

/** Ordered speaker selection: chosen speakers with Move up/down/Remove, then the rest with Add. */
export function SpeakerPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: SpeakerOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [announce, setAnnounce] = useState("");
  const byId = new Map(options.map((o) => [o.id, o]));
  const chosen = value.filter((id) => byId.has(id));
  const rest = options.filter((o) => !chosen.includes(o.id));
  const btn = "btn btn-secondary btn-sm px-3";
  return (
    <div className="grid gap-4">
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      <div>
        <h3 className="mono mb-2 font-bold">On this session ({chosen.length})</h3>
        {chosen.length === 0 ? (
          <p className="text-sm text-ink-3">No speakers yet.</p>
        ) : (
          <ol className="grid gap-2">
            {chosen.map((id, i) => {
              const s = byId.get(id)!;
              return (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2 border-2 border-ink bg-paper-2 p-3">
                  <span className="min-w-0 break-words">
                    <span className="font-semibold">{s.name}</span> <span className="text-sm text-ink-3">{s.detail}</span>
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className={btn} disabled={disabled || i === 0} aria-label={`Move ${s.name} up`}
                      onClick={() => { onChange(moveItem(chosen, i, -1)); setAnnounce(`${s.name} moved up`); }}>
                      <ArrowUp size={16} strokeWidth={2} aria-hidden />
                    </button>
                    <button type="button" className={btn} disabled={disabled || i === chosen.length - 1} aria-label={`Move ${s.name} down`}
                      onClick={() => { onChange(moveItem(chosen, i, 1)); setAnnounce(`${s.name} moved down`); }}>
                      <ArrowDown size={16} strokeWidth={2} aria-hidden />
                    </button>
                    <button type="button" className={btn} disabled={disabled} aria-label={`Remove ${s.name}`}
                      onClick={() => { onChange(chosen.filter((x) => x !== id)); setAnnounce(`${s.name} removed`); }}>
                      <X size={16} strokeWidth={2} aria-hidden />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <div>
        <h3 className="mono mb-2 font-bold">Available speakers</h3>
        {rest.length === 0 ? (
          <p className="text-sm text-ink-3">No more speakers to add. Speakers are managed under Society.</p>
        ) : (
          <ul className="grid gap-2">
            {rest.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-2 border-ink p-3">
                <span className="min-w-0 break-words">
                  <span className="font-semibold">{s.name}</span> <span className="text-sm text-ink-3">{s.detail}</span>
                </span>
                <button type="button" className={btn} disabled={disabled || value.length >= 20} aria-label={`Add ${s.name}`}
                  onClick={() => { onChange([...chosen, s.id]); setAnnounce(`${s.name} added`); }}>
                  <Plus size={16} strokeWidth={2} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
