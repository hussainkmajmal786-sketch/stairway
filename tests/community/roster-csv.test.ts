import { describe, expect, it } from "vitest";
import { MAX_ROSTER_ROWS, chunkRows, parseRosterCsv, parseRosterDate } from "@/lib/community/roster-csv";

describe("parseRosterCsv", () => {
  it("parses a header row, strips a BOM and handles CRLF", () => {
    const r = parseRosterCsv("﻿Member Number,Expiration Date,Name\r\n12345678,2027-12-31,Asha Rao\r\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([{ n: "12345678", e: "2027-12-31", name: "Asha Rao" }]);
  });
  it("detects ; and tab delimiters", () => {
    expect(parseRosterCsv("Member ID;Valid Until;Name\n01234567;31/12/2027;Asha Rao").rows[0]).toEqual({ n: "01234567", e: "2027-12-31", name: "Asha Rao" });
    expect(parseRosterCsv("Member ID\tRenewal\tName\n12345678\t31-12-2027\tAsha Rao").rows[0].e).toBe("2027-12-31");
  });
  it("accepts a headerless file", () => {
    expect(parseRosterCsv("12345678,2027-01-02").rows).toEqual([{ n: "12345678", e: "2027-01-02" }]);
  });
  it("accepts the date formats", () => {
    expect(parseRosterDate("2027-03-04")).toBe("2027-03-04");
    expect(parseRosterDate("04/03/2027")).toBe("2027-03-04");
    expect(parseRosterDate("04-03-2027")).toBe("2027-03-04");
    expect(parseRosterDate("04-Mar-2027")).toBe("2027-03-04");
    expect(parseRosterDate("29-Feb-2028")).toBe("2028-02-29");
  });
  it("rejects impossible dates with a line number", () => {
    const r = parseRosterCsv("number,expires\n12345678,2027-12-31\n87654321,31/02/2027\n");
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([{ line: 3, reason: expect.stringContaining("date") }]);
    expect(parseRosterDate("29-Feb-2027")).toBeNull();
    expect(parseRosterDate("13/13/2027")).toBeNull();
  });
  it("keeps the later expiry for duplicate numbers", () => {
    const r = parseRosterCsv("12345678,2026-01-01\n12345678,2028-01-01\n12345678,2027-01-01");
    expect(r.rows).toEqual([{ n: "12345678", e: "2028-01-01" }]);
  });
  it("pads 7 digit numbers and rejects 6, 9 and 10 digit numbers", () => {
    const r = parseRosterCsv("1234567,2027-01-01\n123456,2027-01-01\n1234567890,2027-01-01\n12345678,2027-01-01\n123456789,2027-01-01");
    expect(r.rows.map((x) => x.n).sort()).toEqual(["01234567", "12345678"]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 5]);
  });
  it("handles quoted names with commas, quotes and newlines", () => {
    const r = parseRosterCsv('number,expiry,name\n12345678,2027-01-01,"Rao, Asha ""A"""\n87654321,2027-01-01,"Line\nBreak"\n11112222,bad,x');
    expect(r.rows[0].name).toBe('Rao, Asha "A"');
    expect(r.rows[1].name).toBe("Line\nBreak");
    expect(r.errors[0].line).toBe(5);
  });
  it("returns nothing for empty input", () => {
    expect(parseRosterCsv("")).toEqual({ rows: [], errors: [] });
    expect(parseRosterCsv("\n\n")).toEqual({ rows: [], errors: [] });
  });
  it("caps the row count with an error", () => {
    const lines = Array.from({ length: MAX_ROSTER_ROWS + 5 }, (_, i) => `${String(10000000 + i)},2027-01-01`).join("\n");
    const r = parseRosterCsv(lines);
    expect(r.rows).toHaveLength(MAX_ROSTER_ROWS);
    expect(r.errors.some((e) => /Too many rows/.test(e.reason))).toBe(true);
  });
  it("rejects oversized files", () => {
    const r = parseRosterCsv("x".repeat(2_000_001));
    expect(r.rows).toEqual([]);
    expect(r.errors).toHaveLength(1);
  });
});

describe("chunkRows", () => {
  it("splits by size", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows(Array.from({ length: 2500 }, (_, i) => i)).map((c) => c.length)).toEqual([1000, 1000, 500]);
    expect(chunkRows([])).toEqual([]);
  });
});
