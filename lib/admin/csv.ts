// Spreadsheet formula injection: a cell that STARTS (ignoring leading blanks) with = + - @ or a tab/CR is prefixed
// with an apostrophe so Excel/Sheets/LibreOffice treat it as text. Applied to every non-numeric cell.
const FORMULA_START = /^[\t\r ]*[=+\-@]|^[\t\r]/;

export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : typeof value === "string" ? value : String(value);
  s = s.replace(/\u0000/g, "");
  if (typeof value !== "number" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CRLF rows. The UTF-8 BOM is added by the route, not here. */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
