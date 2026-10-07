import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { isExternalHref } from "@/lib/registration/external";

interface Props {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  "aria-label"?: string;
  "aria-current"?: "page";
}

/**
 * `next/link` for in-app paths; a plain anchor opening in a new tab (`rel="noopener noreferrer"`) for absolute
 * http(s) URLs. Use it wherever a Register link may resolve to the external Google Form.
 */
export function SmartLink({ href, children, ...rest }: Props) {
  if (isExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}
