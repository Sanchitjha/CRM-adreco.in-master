import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads rows and cells", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted cells with commas, doubled quotes and line breaks", () => {
    const csv = 'name,notes\r\n"Sai, Hotel","said ""hello""\nsecond line"\r\n';
    expect(parseCsv(csv)).toEqual([
      ["name", "notes"],
      ["Sai, Hotel", 'said "hello"\nsecond line'],
    ]);
  });

  it("skips a byte-order mark and blank lines", () => {
    expect(parseCsv("﻿name,phone\n\n  ,  \nRaj,98\n")).toEqual([
      ["name", "phone"],
      ["Raj", "98"],
    ]);
  });

  it("detects semicolon and tab separated files", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps empty cells and a last row without a trailing newline", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([["a", "b", "c"], ["1", "", "3"]]);
  });
});

describe("toCsv", () => {
  it("quotes cells that need it", () => {
    expect(toCsv([["Sai, Hotel", 'say "hi"', "plain"]])).toBe('"Sai, Hotel","say ""hi""",plain\r\n');
  });

  it("writes empty values for null and undefined", () => {
    expect(toCsv([["a", null, undefined, 5]])).toBe("a,,,5\r\n");
  });

  it("neutralises spreadsheet formulas but leaves phone numbers alone", () => {
    expect(toCsv([["=HYPERLINK(\"x\")", "@SUM(A1)", "-5+3x"]])).toBe('"\'=HYPERLINK(""x"")",\'@SUM(A1),\'-5+3x\r\n');
    expect(toCsv([["+91 98765 43210", "-12.5"]])).toBe("+91 98765 43210,-12.5\r\n");
  });

  it("round-trips through parseCsv", () => {
    const rows = [["Customer", "Notes"], ["Raj, Sons", 'line1\nline2 "q"']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
