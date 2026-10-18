"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Flag, ShieldAlert } from "lucide-react";
import { formatChatTime, type ChatMessage } from "@/lib/community/chat";
import { cn } from "@/lib/utils";

/**
 * The conversation. `role="log"` announces additions politely. Own messages sit right on a yellow tint, team messages
 * left on paper-2; ink text on cream/tint only, and every message carries a visible "You" / "st(AI)rway team" label,
 * so nothing relies on colour. Auto-scrolls only when the reader is already at the bottom; never animates.
 */
export function MessageList({
  messages,
  viewer,
  renderAction,
  flaggedIds,
}: {
  messages: ChatMessage[];
  viewer: "user" | "admin";
  renderAction?: (m: ChatMessage) => ReactNode;
  flaggedIds?: ReadonlySet<number>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Conversation"
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
      className="grid max-h-[60vh] min-h-48 content-start gap-3 overflow-y-auto border-2 border-ink bg-paper p-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-field md:p-4"
    >
      {messages.length === 0 && <p className="text-ink-3">No messages yet. Say hello below.</p>}
      {messages.map((m) => {
        const mine = viewer === "user" ? !m.from_admin : m.from_admin;
        const who = m.from_admin ? "st(AI)rway team" : viewer === "user" ? "You" : "Member";
        const flagged = !!m.flagged_at || !!flaggedIds?.has(m.id);
        return (
          <article key={m.id} className={cn("max-w-[85%] border-2 border-ink p-3 text-ink", mine ? "ml-auto bg-yellow" : "mr-auto bg-paper-2")}>
            <header className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-bold uppercase tracking-[0.1em]">
              <span>{who}</span>
              <time dateTime={m.created_at} className="font-normal normal-case tracking-normal text-ink-2">{formatChatTime(m.created_at)}</time>
              {flagged && (
                <span className="inline-flex items-center gap-1 border border-ink bg-red px-1.5 text-ink"><ShieldAlert size={12} aria-hidden /> Flagged</span>
              )}
            </header>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            {renderAction && !m.from_admin && !flagged && <div className="mt-2">{renderAction(m)}</div>}
          </article>
        );
      })}
    </div>
  );
}

export function FlagButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn btn-sm btn-secondary min-h-11" onClick={onClick}>
      <Flag size={14} aria-hidden /> Flag message
    </button>
  );
}
