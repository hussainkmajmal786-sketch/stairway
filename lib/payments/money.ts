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

/** Paise → "₹199" / "₹1,999.50" (Indian digit grouping). */
export function formatInr(paise: number): string {
  return paise % 100 === 0 ? whole.format(paise / 100) : exact.format(paise / 100);
}
