export interface MarkPart {
  text: string;
  marked: boolean;
}

/**
 * Splits heading copy on the highlighter syntax: "Pick your [[stairway.]]" →
 * [{ text: "Pick your ", marked: false }, { text: "stairway.", marked: true }].
 * Empty or unclosed brackets stay literal text; empty parts are dropped.
 */
export function splitMarks(text: string): MarkPart[] {
  return text
    .split(/(\[\[.+?\]\])/g)
    .filter(Boolean)
    .map((tok) => (/^\[\[.+\]\]$/.test(tok) ? { text: tok.slice(2, -2), marked: true } : { text: tok, marked: false }));
}
