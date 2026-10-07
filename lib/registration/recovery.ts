import { loginPath, registerPath } from "./cta";
import type { Recovery } from "./errors";

/** The schedule (every society's stairway) on the home page; there is no /events listing route. */
export const SCHEDULE_HREF = "/#societies";

/** One button or link offered under a registration error. */
export type RecoveryAction =
  | { kind: "retry"; label: string }
  | { kind: "reload"; label: string }
  | { kind: "focus_fields"; label: string }
  | { kind: "link"; label: string; href: string; primary: boolean }
  | { kind: "external"; label: string; href: string };

export interface RecoveryContext {
  /** Event slug when the error happened on (or about) one event. */
  slug?: string;
  /** Internal path (built with the cta.ts helpers) to come back to after signing in, e.g. a ticket page. */
  here?: string;
  /** https Google Form offered as a fallback when on-site registration keeps failing. */
  fallbackUrl: string | null;
  /** The caller can re-run the failed action (otherwise "retry" reloads the page). */
  canRetry: boolean;
  /** The caller can move focus to the first invalid field. */
  canFixFields: boolean;
}

const RELOAD: RecoveryAction = { kind: "reload", label: "Reload the page" };

/**
 * Exhaustive over `Recovery` (a missing key is a type error), so every error the server can return has a UI action.
 * Hrefs are internal paths built with the cta.ts helpers, or the https-only fallback form.
 */
export const RECOVERY_ACTIONS: { readonly [R in Recovery]: (c: RecoveryContext) => RecoveryAction[] } = {
  retry: (c) => [
    c.canRetry ? { kind: "retry", label: "Try again" } : RELOAD,
    ...(c.fallbackUrl ? [{ kind: "external", label: "Use the Google Form", href: c.fallbackUrl } as const] : []),
  ],
  reload: () => [{ kind: "reload", label: "Reload the form" }],
  sign_in: (c) => [{ kind: "link", label: "Sign in", href: loginPath(here(c)), primary: true }],
  onboarding: (c) => [
    { kind: "link", label: "Finish your profile", href: `/onboarding?next=${encodeURIComponent(here(c))}`, primary: true },
  ],
  tickets: () => [{ kind: "link", label: "Go to My tickets", href: "/me/tickets", primary: true }],
  event: (c) => [
    c.slug
      ? { kind: "link", label: "Back to the session", href: `/events/${encodeURIComponent(c.slug)}`, primary: false }
      : { kind: "link", label: "See all sessions", href: SCHEDULE_HREF, primary: false },
  ],
  events: () => [{ kind: "link", label: "See all sessions", href: SCHEDULE_HREF, primary: false }],
  fix_fields: (c) => (c.canFixFields ? [{ kind: "focus_fields", label: "Show me the first field" }] : []),
};

function here(c: RecoveryContext) {
  if (c.here) return c.here;
  return c.slug ? registerPath(c.slug) : "/me/tickets";
}

export function recoveryActions(recovery: Recovery, c: RecoveryContext): RecoveryAction[] {
  return RECOVERY_ACTIONS[recovery](c);
}
