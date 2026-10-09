import { createElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { splitMarks } from "@/lib/design/marks";

type Tag = "h1" | "h2" | "h3" | "p";

/** Yellow highlighter stroke for [[words]] on cream. */
export const MARK_PAPER = "bg-transparent bg-[linear-gradient(transparent_58%,var(--yellow)_58%,var(--yellow)_92%,transparent_92%)] px-[0.05em] text-inherit";
/** On the field the marked words turn yellow instead (cream text on a yellow marker would be unreadable). */
export const MARK_FIELD = "bg-transparent text-yellow";

/**
 * Heading with an optional highlighter: wrap words in [[double brackets]]. `rule` draws the poster rule heading
 * (lead rule · words · trailing rule); the words then sit in one span so the flex layout keeps their spaces.
 */
export function Heading({
  as = "h2",
  text,
  className,
  id,
  tone = "paper",
  rule,
}: {
  as?: Tag;
  text: string;
  className?: string;
  id?: string;
  tone?: "paper" | "field";
  rule?: "left" | "both";
}) {
  const parts: ReactNode[] = splitMarks(text).map((p, i) =>
    p.marked ? (
      <mark key={i} className={tone === "field" ? MARK_FIELD : MARK_PAPER}>
        {p.text}
      </mark>
    ) : (
      p.text
    ),
  );
  const body = rule ? <span className="min-w-0 max-w-[20ch]">{parts}</span> : parts;
  return createElement(as, { id, className: cn(rule && "rule-h", rule === "left" && "left", className) || undefined, "data-reveal": "" }, body);
}
