import { createElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tag = "h1" | "h2" | "h3" | "p";

/**
 * Heading with an optional highlighter: wrap words in [[double brackets]]
 * to put them on a yellow marker stroke.
 */
export function Heading({ as = "h2", text, className, id }: { as?: Tag; text: string; className?: string; id?: string }) {
  const parts: ReactNode[] = text.split(/(\[\[.+?\]\])/g).filter(Boolean).map((tok, i) =>
    tok.startsWith("[[") ? (
      <mark key={i} className="bg-[linear-gradient(transparent_58%,var(--yellow)_58%,var(--yellow)_92%,transparent_92%)] px-[0.05em] text-inherit">
        {tok.slice(2, -2)}
      </mark>
    ) : (
      tok
    ),
  );
  return createElement(as, { id, className: cn(className), "data-reveal": "" }, parts);
}
