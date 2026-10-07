import { describe, expect, it } from "vitest";
import { qrPath, qrRows } from "@/lib/tickets/qr";

/** Reads the 15-bit format information beside the top-left finder (ISO/IEC 18004 §7.9) and unmasks it. */
function formatInfo(rows: readonly string[]): { ecc: string; mask: number } {
  const bits =
    [0, 1, 2, 3, 4, 5, 7, 8].map((x) => rows[8][x]).join("") +
    [7, 5, 4, 3, 2, 1, 0].map((y) => rows[y][8]).join("");
  const raw = parseInt(bits, 2) ^ 0b101010000010010;
  return { ecc: ["M", "L", "H", "Q"][raw >> 13], mask: (raw >> 10) & 0b111 };
}

describe("qrRows", () => {
  const code = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // 26-char base32, like a real ticket code
  const rows = qrRows(code);
  it("is a square matrix of 0/1", () => {
    expect(rows.length).toBeGreaterThanOrEqual(21);
    for (const r of rows) {
      expect(r).toMatch(/^[01]+$/);
      expect(r.length).toBe(rows.length);
    }
  });
  it("starts with the top-left finder pattern (no quiet zone)", () => {
    expect(rows[0].slice(0, 7)).toBe("1111111");
    expect(rows[6].slice(0, 7)).toBe("1111111");
    expect(rows[1].slice(0, 7)).toBe("1000001");
  });
  it("has all three finder patterns flush to the edges", () => {
    const n = rows.length;
    expect(rows[0].slice(n - 7)).toBe("1111111");
    expect(rows[n - 1].slice(0, 7)).toBe("1111111");
    expect(rows[2].slice(2, 5)).toBe("111");
  });
  it("fits a 26-char code in version 2 (25x25) with ECC M, in either case", () => {
    expect(rows.length).toBe(25);
    expect(formatInfo(rows).ecc).toBe("M");
    const lower = qrRows(code.toLowerCase()); // byte mode instead of alphanumeric
    expect(lower.length).toBe(25);
    expect(formatInfo(lower).ecc).toBe("M");
  });
  it("has the timing patterns and the dark module where a decoder expects them", () => {
    const n = rows.length;
    const alt = Array.from({ length: n - 16 }, (_, i) => (i % 2 === 0 ? "1" : "0")).join("");
    expect(rows[6].slice(8, n - 8)).toBe(alt);
    expect(rows.slice(8, n - 8).map((r) => r[6]).join("")).toBe(alt);
    expect(rows[n - 8][8]).toBe("1"); // dark module at (8, 4V+9)
  });
  it("is deterministic", () => expect(qrRows(code)).toEqual(rows));
});

describe("qrPath", () => {
  it("draws one square per dark module", () => expect(qrPath(["10", "01"])).toBe("M0 0h1v1h-1zM1 1h1v1h-1z"));
  it("merges horizontal runs", () => expect(qrPath(["0110"])).toBe("M1 0h2v1h-2z"));
  it("is empty for a blank matrix", () => expect(qrPath(["000"])).toBe(""));
  it("covers exactly the dark modules of a real code", () => {
    const rows = qrRows("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    const dark = rows.join("").split("").filter((c) => c === "1").length;
    const covered = [...qrPath(rows).matchAll(/h(\d+)v1/g)].reduce((s, m) => s + Number(m[1]), 0);
    expect(covered).toBe(dark);
  });
});
