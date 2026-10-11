"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchRegistrantsAction, type AttendeeHit } from "@/lib/admin/registration-actions";

/** Find a confirmed attendee by name or token number. Debounced; at most 10 hits; picking one = identity confirmed. */
export function AttendeeSearch({
  eventId,
  disabled,
  onPick,
}: {
  eventId: string;
  disabled: boolean;
  onPick: (hit: AttendeeHit) => void;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AttendeeHit[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length === 0) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const r = await searchRegistrantsAction({ eventId, q: term });
        if (mine !== seq.current) return; // a newer keystroke owns the result
        if (!r.ok) {
          setError(r.error.message);
          setHits(null);
        } else {
          setHits(r.data);
        }
      } catch {
        if (mine === seq.current) setError("The search is unavailable. Check your connection.");
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, eventId]);

  const shown = q.trim().length === 0 ? null : hits;
  return (
    <div className="grid gap-3">
      <label htmlFor={`${id}-q`} className="mono text-xs font-bold">
        Find by name or token number
      </label>
      <div className="flex items-center gap-2">
        <Search size={20} aria-hidden />
        <input
          id={`${id}-q`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={80}
          autoComplete="off"
          inputMode="search"
          className="h-12 min-w-0 flex-1 border-2 border-ink bg-white px-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-field"
        />
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-ink-3">
        {loading ? "Searching…" : shown ? `${shown.length} found` : ""}
      </p>
      {error && (
        <p role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
          {error}
        </p>
      )}
      {shown && (
        <ul className="grid gap-2">
          {shown.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(h)}
                className="box flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block break-words font-semibold">{h.fullName}</span>
                  <span className="block break-words text-sm text-ink-3">
                    {h.college}
                    {h.token ? ` · ${h.token}` : ""}
                  </span>
                </span>
                {h.checkedIn && <span className="tag tag-green shrink-0">Checked in</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
