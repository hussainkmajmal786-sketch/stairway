/** Visible text of a heading that may contain [[highlight]] markers. */
export const plainTitle = (text: string) => text.replace(/\[\[|\]\]/g, "");

/**
 * Anton display size for a page/event title. Long titles step down a size instead of being clamped to two lines,
 * so no words are ever hidden. Class strings are literal so Tailwind generates them.
 */
export function displayTitleClass(text: string): string {
  const n = plainTitle(text).trim().length;
  if (n <= 24) return "text-[clamp(2.6rem,7vw,5rem)]";
  if (n <= 48) return "text-[clamp(2.2rem,5.4vw,3.8rem)]";
  return "text-[clamp(1.9rem,4.2vw,3rem)]";
}
