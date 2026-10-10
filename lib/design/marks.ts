export interface MarkPart {
  text: string;
  marked: boolean;
}

// "[[", then at least one character that does not open another "[[" (newlines allowed), then the first "]]"
const MARK = /(\[\[(?:(?!\[\[)[\s\S])+?\]\])/;

/**
 * Splits heading copy on the highlighter syntax: "Pick your [[stairway.]]" ?
 * [{ text: "Pick your ", marked: false }, { text: "stairway.", marked: true }].
 * Empty or unclosed brackets stay literal text; empty parts are dropped. Nested brackets: the innermost pair wins and
 * the outer brackets stay literal. A newline inside the brackets is kept inside the marked part.
 */
export function splitMarks(text: string): MarkPart[] {
  // split() with one capture group puts the captured marks at the odd indexes
  return text
    .split(MARK)
    .map((tok, i) => (i % 2 === 1 ? { text: tok.slice(2, -2), marked: true } : { text: tok, marked: false }))
    .filter((p) => p.text !== "");
}