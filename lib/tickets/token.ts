/** Door token: `${prefix}-${n padded to 4}`, e.g. RAS-05-0042 (spec §5 Tickets). */
export function formatToken(prefix: string, n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Invalid token number: ${n}`);
  const num = String(n).padStart(4, "0");
  return prefix ? `${prefix}-${num}` : num;
}
