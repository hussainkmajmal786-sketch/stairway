import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared input skin without size: a white well with a soft inset shadow, a 3px cobalt focus ring, and the error
 * recipe (red-ink border with an 8px left edge on #FFF6F5).
 */
export const inputBase =
  "border-2 border-ink bg-white text-ink shadow-[inset_3px_3px_0_rgba(11,16,38,0.06)] placeholder:text-ink-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-field aria-[invalid=true]:border-red-ink aria-[invalid=true]:border-l-8 aria-[invalid=true]:bg-error-bg";
export const inputCls = cn("h-12 w-full px-4", inputBase);
export const textareaCls = cn("min-h-28 w-full px-4 py-3", inputBase);

/**
 * `aria-describedby` for a control inside <Field>: its error (`<id>-err`) and its hint (`<id>-hint`), in the order
 * Field renders them. Field shows the hint even while an error is showing, so both are described.
 */
export function fieldDescribedBy(id: string, { error, hint }: { error?: string; hint?: string }): string | undefined {
  const ids = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/** Error row: a decorative red "!" square and the message in red-ink. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-2 text-sm font-semibold text-red-ink">
      <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center border-2 border-ink bg-red font-mono text-xs font-bold leading-none text-ink">
        !
      </span>
      <span>{children}</span>
    </p>
  );
}

export function Field({
  id, label, error, hint, required = false, children, className,
}: {
  id: string; label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mono mb-2 block font-bold">
        {label}
        {required && <span className="ml-0.5 text-red-ink" aria-hidden>*</span>}
      </label>
      {children}
      {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
