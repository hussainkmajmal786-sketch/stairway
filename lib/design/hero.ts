import { formatDate } from "@/lib/weekends";
import { padStep } from "./ghost";

export interface RuleHead {
  lead: string;
  verb: "opens" | "is on";
  when: string;
}

/** The rule head when no session is scheduled (or its date is unreadable): "Next step opens soon". */
export const RULE_HEAD_FALLBACK: RuleHead = { lead: "Next step", verb: "opens", when: "soon" };

/**
 * The hero's poster rule head, e.g. "Step 04 opens Sat 17 Oct" (IST date); "is on" once the step has started.
 * No session (null) or an unparseable start date gives RULE_HEAD_FALLBACK instead of throwing.
 */
export function ruleHead(ev: { step: number; start: string } | null | undefined, now: number): RuleHead {
  const start = ev ? Date.parse(ev.start) : NaN;
  if (!ev || !Number.isFinite(start)) return RULE_HEAD_FALLBACK;
  return {
    lead: `Step ${padStep(ev.step)}`,
    verb: start > now ? "opens" : "is on",
    when: formatDate(ev.start, { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, ""),
  };
}

/** "@handle" from an http(s) profile URL's first path segment, or null. */
export function handleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const seg = u.pathname.split("/").filter(Boolean)[0];
    return seg ? `@${decodeURIComponent(seg)}` : null;
  } catch {
    return null;
  }
}

/** The handles row under the hero: the Instagram handle and the site's host, whichever are valid. */
export function heroHandles(s: { social: { instagram: string }; siteUrl: string }): string[] {
  let host: string | null = null;
  try {
    const u = new URL(s.siteUrl);
    host = u.protocol === "https:" || u.protocol === "http:" ? u.host : null;
  } catch {
    host = null;
  }
  return [handleFromUrl(s.social.instagram), host].filter((x): x is string => !!x);
}
