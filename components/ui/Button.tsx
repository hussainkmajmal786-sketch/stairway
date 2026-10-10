"use client";

import Link from "next/link";
import type { ReactNode, MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { isExternalHref } from "@/lib/registration/external";

interface Props {
  href?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  variant?: "primary" | "secondary" | "ghost" | "ink";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  className?: string;
  /** Analytics event fired on click, e.g. "register_click" */
  trackAs?: string;
  trackProps?: Record<string, string | number>;
  type?: "button" | "submit";
  disabled?: boolean;
  external?: boolean;
  ariaLabel?: string;
}

/** Square, ink-bordered button with a hard shadow that presses in on click. */
export function Button({
  href,
  onClick,
  variant = "primary",
  size = "md",
  children,
  className,
  trackAs,
  trackProps,
  type = "button",
  disabled,
  external,
  ariaLabel,
}: Props) {
  const handleClick = (e: MouseEvent<HTMLElement>) => {
    if (trackAs) track(trackAs, trackProps);
    onClick?.(e);
  };
  const cls = cn("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, className);

  if (href) {
    if (external ?? isExternalHref(href))
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls} onClick={handleClick} aria-label={ariaLabel}>
          {children}
        </a>
      );
    return (
      <Link href={href} className={cls} onClick={handleClick} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} disabled={disabled} aria-disabled={disabled} className={cls} onClick={handleClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
