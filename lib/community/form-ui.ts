// Pure helpers behind the home-page "Get involved" forms (no DOM, no React): tab model, keyboard navigation,
// field visibility and the conversion of raw form strings into the payload the server action validates.

export type FormKind = "host_event" | "partner" | "feedback";

export const KINDS: readonly { kind: FormKind; label: string; hash: string }[] = [
  { kind: "host_event", label: "Host an event", hash: "host-event" },
  { kind: "partner", label: "Become a community partner", hash: "partner" },
  { kind: "feedback", label: "Suggestions & complaints", hash: "feedback" },
];

/** `#partner` (with or without the #) -> kind; anything else -> null. */
export function kindFromHash(hash: string): FormKind | null {
  const h = hash.replace(/^#/, "");
  return KINDS.find((k) => k.hash === h)?.kind ?? null;
}
export const hashForKind = (kind: FormKind): string => KINDS.find((k) => k.kind === kind)?.hash ?? "host-event";

/** Roving-tabindex arrow navigation for a horizontal tablist (wraps; Home/End jump). null = key not handled. */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export type ContactField = "name" | "email" | "phone" | "organisation";
/** Contact fields shown for a form state: anonymous feedback shows none at all. */
export function contactFields(kind: FormKind, anonymous: boolean): ContactField[] {
  return kind === "feedback" && anonymous ? [] : ["name", "email", "phone", "organisation"];
}

export type RawValues = Record<string, string>;

/** Raw strings -> the object `submitCommunityRequest` validates. Anonymous feedback carries no contact fields. */
export function buildPayload(kind: FormKind, v: RawValues, anonymous: boolean, hp: string, startedAt: number): Record<string, unknown> {
  const base = { kind, subject: v.subject ?? "", message: v.message ?? "", hp, startedAt };
  let details: Record<string, unknown>;
  if (kind === "host_event") {
    const n = (v.expected_attendees ?? "").trim();
    details = {
      event_title: v.event_title ?? "",
      ...(n !== "" ? { expected_attendees: Number(n) } : {}),
      ...((v.preferred_date ?? "") !== "" ? { preferred_date: v.preferred_date } : {}),
      venue: v.venue ?? "",
      website: v.website ?? "",
    };
  } else if (kind === "partner") {
    details = { partnership_type: v.partnership_type ?? "", website: v.website ?? "" };
  } else {
    details = { category: v.category ?? "" };
  }
  if (kind === "feedback" && anonymous) return { ...base, anonymous: true, details };
  return {
    ...base,
    name: v.name ?? "",
    email: v.email ?? "",
    phone: v.phone ?? "",
    organisation: v.organisation ?? "",
    details,
  };
}

/** Server field paths ("details.event_title", "email") -> the input key used by the form. */
export const errorKey = (path: string): string => path.replace(/^details\./, "");

/** First field (in on-screen order) that has an error, so focus can move there. */
export function firstInvalid(order: readonly string[], errors: Record<string, string>): string | null {
  const keys = new Set(Object.keys(errors).map(errorKey));
  return order.find((k) => keys.has(k)) ?? null;
}
