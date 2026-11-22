import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("plain")).toBe("plain");
  });
  it("neutralises spreadsheet formulas typed by visitors", () => {
    for (const evil of ['=HYPERLINK("http://evil")', "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
      expect(csvCell(evil).replace(/^"/, "")).toMatch(/^'/);
    }
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("-")).toBe("'-");
  });
  it("writes empty cells for null and undefined, and keeps numbers and booleans", () => {
    expect(toCsv(["a", "b", "c", "d"], [[null, undefined, 3, true]])).toBe(
      "﻿a,b,c,d\r\n,,3,true\r\n",
    );
  });
});
