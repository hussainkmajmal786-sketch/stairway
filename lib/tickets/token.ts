/** Door token: `${prefix}-${n padded to 4}`, e.g. RAS-05-0042 (spec §5 Tickets). */
export function formatToken(prefix: string, n: number): string {
  const num = String(Math.trunc(n)).padStart(4, "0");
  return prefix ? `${prefix}-${num}` : num;
}
