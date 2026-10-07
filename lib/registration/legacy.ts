import { pickNext, withStatus } from "@/lib/events/status";
import type { EventView } from "@/lib/events/types";
import type { Settings } from "@/lib/site/schema";
import { openSlug, SESSIONS_HREF } from "@/lib/weekends";
import { registerPath } from "./cta";
import { externalRegistrationUrl } from "./external";

/**
 * Where the retired all-in-one /register form now sends visitors (old links: /register, /register?step=<slug>):
 * the external Google Form in external mode; else the named session's register page (its event page once it has
 * ended); else the next open session's register page; else the session list on the home page.
 * Only slugs of published events are ever used, and paths are percent-encoded.
 */
export function legacyRegisterTarget(input: {
  step: string | null;
  events: EventView[];
  registration: Settings["registration"];
  now: number;
}): string {
  const external = externalRegistrationUrl(input.registration);
  if (external) return external;
  const list = withStatus(input.events, input.now);
  const named = input.step ? list.find((e) => e.slug === input.step) : undefined;
  if (named) return named.status === "completed" ? `/events/${encodeURIComponent(named.slug)}` : registerPath(named.slug);
  const next = openSlug(pickNext(list));
  return next ? registerPath(next) : SESSIONS_HREF;
}
