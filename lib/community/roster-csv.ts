// Pure, DOM-free roster CSV parser. It runs in the super admin's BROWSER; member numbers and names never reach a log.

export interface RosterRow {
  n: string;
  e: string; // YYYY-MM-DD
  name?: string;
}
export interface RosterParseResult {
  rows: RosterRow[];
  errors: { line: number; reason: string }[];
}

export const MAX_ROSTER_ROWS = 5000;
export const MAX_ROSTER_CHARS = 2_000_000;
const MAX_ERRORS = 200;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function validDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD-Mon-YYYY. Impossible dates return null. */
export function parseRosterDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ,]*(\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    return mon ? validDate(+m[3], mon, +m[1]) : null;
  }
  return null;
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  let best = ",";
  let bestCount = -1;
  for (const d of [",", ";", "\t"]) {
    let inQ = false;
    let c = 0;
    for (const ch of first) {
      if (ch === '"') inQ = !inQ;
      else if (ch === d && !inQ) c++;
    }
    if (c > bestCount) {
      best = d;
      bestCount = c;
    }
  }
  return best;
}

interface Rec {
  line: number;
  cells: string[];
}

function tokenise(text: string, delim: string): Rec[] {
  const out: Rec[] = [];
  let cells: string[] = [];
  let cur = "";
  let inQ = false;
  let line = 1;
  let startLine = 1;
  const endRecord = () => {
    cells.push(cur);
    if (!(cells.length === 1 && cells[0].trim() === "")) out.push({ line: startLine, cells });
    cells = [];
    cur = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else {
        if (ch === "\n") line++;
        cur += ch;
      }
      continue;
    }
    if (ch === '"') inQ = true;
    else if (ch === delim) {
      cells.push(cur);
      cur = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      startLine = line;
    } else cur += ch;
  }
  if (cur !== "" || cells.length > 0) endRecord();
  return out;
}

type Cols = { n: number; e: number; name: number };

function headerCols(cells: string[]): Cols | null {
  const lower = cells.map((c) => c.trim().toLowerCase());
  if (lower.some((c) => /^\d{8,9}$/.test(c))) return null; // a data row, not a header
  const cols: Cols = { n: -1, e: -1, name: -1 };
  lower.forEach((c, i) => {
    if (/expir|valid|renew/.test(c)) {
      if (cols.e < 0) cols.e = i;
    } else if (/name/.test(c)) {
      if (cols.name < 0) cols.name = i;
    } else if (/member|number|\bid\b|^id$/.test(c)) {
      if (cols.n < 0) cols.n = i;
    }
  });
  return cols.n >= 0 && cols.e >= 0 ? cols : null;
}

export function parseRosterCsv(input: string): RosterParseResult {
  const errors: { line: number; reason: string }[] = [];
  const addError = (line: number, reason: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ line, reason });
  };
  if (input.length > MAX_ROSTER_CHARS) {
    addError(0, "File is too large (2 MB at most).");
    return { rows: [], errors };
  }
  const text = input.replace(/^﻿/, "");
  if (text.trim() === "") return { rows: [], errors };
  const recs = tokenise(text, detectDelimiter(text));

  let cols: Cols = { n: 0, e: 1, name: 2 };
  let start = 0;
  if (recs.length > 0) {
    const h = headerCols(recs[0].cells);
    if (h) {
      cols = h;
      start = 1;
    }
  }

  const byNumber = new Map<string, RosterRow>();
  let seen = 0;
  for (let i = start; i < recs.length; i++) {
    const { line, cells } = recs[i];
    if (seen >= MAX_ROSTER_ROWS) {
      addError(line, `Too many rows: only the first ${MAX_ROSTER_ROWS} were read.`);
      break;
    }
    seen++;
    const n = (cells[cols.n] ?? "").trim();
    if (!/^\d{8,9}$/.test(n)) {
      addError(line, "Member number must be 8 or 9 digits.");
      continue;
    }
    const e = parseRosterDate(cells[cols.e] ?? "");
    if (!e) {
      addError(line, "Expiry date is missing or not a real date.");
      continue;
    }
    const name = cols.name >= 0 ? (cells[cols.name] ?? "").trim().slice(0, 120) : "";
    const prev = byNumber.get(n);
    if (!prev || e >= prev.e) byNumber.set(n, name ? { n, e, name } : { n, e });
  }
  return { rows: [...byNumber.values()], errors };
}

export function chunkRows<T>(rows: T[], size = 1000): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += step) out.push(rows.slice(i, i + step));
  return out;
}
