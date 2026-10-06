/** Element id of the form-level error (schema issues not tied to one field, e.g. answers too long in total). */
export const FORM_ERROR_ID = "form";

export const REGISTRANT_FIELDS = ["fullName", "college", "branch", "year", "phone", "ieeeMemberId"] as const;

/** Focus order: registrant fields, then questions (`q-<id>`), then the form-level error. */
export function fieldOrder(questionIds: readonly string[]): string[] {
  return [...REGISTRANT_FIELDS, ...questionIds.map((id) => `q-${id}`), FORM_ERROR_ID];
}

/** First element id (in focus order) that has an error, falling back to any unknown key so nothing is skipped. */
export function firstInvalid(errors: Record<string, string>, order: readonly string[]): string | null {
  const known = order.find((id) => errors[id]);
  if (known) return known;
  return Object.keys(errors).length > 0 ? FORM_ERROR_ID : null;
}

/**
 * Whether a submit may call the server. Any known client-side error blocks it, even one with no matching field,
 * so the server is never called with answers we already know are invalid.
 */
export function submitGate(
  clientErrors: Record<string, string>,
  order: readonly string[],
): { submit: true } | { submit: false; focusId: string } {
  const focusId = firstInvalid(clientErrors, order);
  return focusId ? { submit: false, focusId } : { submit: true };
}

/** Message for the form-level error: the `form` issue, or any issue whose key has no field on the page. */
export function formLevelError(errors: Record<string, string>, order: readonly string[]): string | undefined {
  if (errors[FORM_ERROR_ID]) return errors[FORM_ERROR_ID];
  const stray = Object.keys(errors).find((k) => !order.includes(k));
  return stray ? errors[stray] : undefined;
}
