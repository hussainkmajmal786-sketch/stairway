import { encode } from "uqr";

/**
 * QR matrix for an opaque ticket code as rows of "1" (dark) / "0" (light), ECC M, without a quiet zone
 * (the renderer adds the margin). `uqr` is pure ESM with no Node APIs, so this runs in the Worker.
 */
export function qrRows(text: string): string[] {
  const { data } = encode(text, { ecc: "M", border: 0 });
  return data.map((row) => row.map((dark) => (dark ? "1" : "0")).join(""));
}

/** SVG path drawing every dark module (one unit each), merging horizontal runs to keep it small. */
export function qrPath(rows: readonly string[]): string {
  let d = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "1") {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end] === "1") end++;
      d += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return d;
}
