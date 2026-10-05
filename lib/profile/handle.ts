export const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export function normalizeHandle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 30)
    .replace(/[-_]+$/, "");
}

/** A valid starting handle from the user's name, else the email's local part, else "user". */
export function suggestHandle(name: string, email: string): string {
  const candidates = [normalizeHandle(name), normalizeHandle(email.split("@")[0] ?? "")];
  return candidates.find((c) => HANDLE_RE.test(c)) ?? "user";
}
