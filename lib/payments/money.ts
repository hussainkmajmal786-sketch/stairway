const whole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const exact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Paise → "₹199" / "₹1,999.50" (Indian digit grouping). Money is integer paise; a non-number, NaN, Infinity or a
 * negative amount is never shown as a price ("—"), and a fractional value is rounded to whole paise.
 */
export function formatInr(paise: number): string {
  if (typeof paise !== "number" || !Number.isFinite(paise) || paise < 0) return "—";
  const p = Math.round(paise);
  return p % 100 === 0 ? whole.format(p / 100) : exact.format(p / 100);
}
