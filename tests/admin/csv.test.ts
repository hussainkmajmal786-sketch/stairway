import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/admin/csv";

describe("csvCell", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+91 98765 43210", "'+91 98765 43210"],
    ["-5", "'-5"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["	cmd", "'	cmd"],
    ["  =1+1", "'  =1+1"],
    ["\r=1", "\"'\r=1\""],
  ])("neutralises %j", (input, out) => {
    expect(csvCell(input)).toBe(out);
  });
  it("leaves numbers, including negatives, unprefixed", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(42)).toBe("42");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("renders null and undefined as empty and strips NUL", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("a\u0000b")).toBe("ab");
  });
  it("leaves ordinary text alone", () => {
    expect(csvCell("Asha K")).toBe("Asha K");
    expect(csvCell("RAS-05-0042")).toBe("RAS-05-0042");
  });
});

describe("toCsv", () => {
  it("writes a header, CRLF rows and a trailing CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x"], ["=y", null]])).toBe("a,b\r\n1,x\r\n'=y,\r\n");
  });
  it("neutralises formulas in the header too", () => {
    expect(toCsv(["=evil"], [])).toBe("'=evil\r\n");
  });
});
