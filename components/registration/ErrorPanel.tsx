"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import type { RegistrationError } from "@/lib/registration/errors";
import { recoveryActions, type RecoveryAction } from "@/lib/registration/recovery";
import { cn } from "@/lib/utils";

function assertNever(x: never): never {
  throw new Error(`Unhandled recovery action: ${JSON.stringify(x)}`);
}

/** Typed registration error with its recovery actions. Takes focus so screen readers and keyboards land on it. */
export function ErrorPanel({
  error, slug, here, fallbackUrl, onRetry, onFixFields, autoFocus = true,
}: {
  error: RegistrationError;
  slug?: string;
  /** Internal path to return to after signing in (defaults to the register page or My tickets). */
  here?: string;
  fallbackUrl: string | null;
  onRetry?: () => void;
  onFixFields?: () => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [error, autoFocus]);

  const actions = recoveryActions(error.recovery, {
    slug, here, fallbackUrl, canRetry: !!onRetry, canFixFields: !!onFixFields,
  });

  const render = (a: RecoveryAction) => {
    switch (a.kind) {
      case "retry":
        return (
          <button key={a.kind} type="button" className="btn btn-sm btn-primary" onClick={onRetry}>
            <RotateCcw size={16} strokeWidth={2} aria-hidden /> {a.label}
          </button>
        );
      case "reload":
        return (
          <button key={a.kind} type="button" className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
            <RotateCcw size={16} strokeWidth={2} aria-hidden /> {a.label}
          </button>
        );
      case "focus_fields":
        return (
          <button key={a.kind} type="button" className="btn btn-sm btn-secondary" onClick={onFixFields}>
            {a.label}
          </button>
        );
      case "link":
        return (
          <Link key={a.href} href={a.href} className={cn("btn btn-sm", a.primary ? "btn-primary" : "btn-secondary")}>
            {a.label}
          </Link>
        );
      case "external":
        return (
          <a key={a.href} className="btn btn-sm btn-secondary" href={a.href} target="_blank" rel="noopener noreferrer">
            {a.label} <ExternalLink size={14} strokeWidth={2} aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        );
      default:
        return assertNever(a);
    }
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="border-2 border-ink bg-red/15 p-5"
    >
      <p className="flex items-start gap-2 font-semibold">
        <AlertTriangle size={18} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden /> {error.message}
      </p>
      {actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions.map(render)}</div>}
    </div>
  );
}
