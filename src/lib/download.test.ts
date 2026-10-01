import { describe, expect, it } from "vitest";

import { csvCell, safeFileName } from "./download";

describe("csvCell", () => {
  it("leaves ordinary values alone", () => {
    expect(csvCell("Midnight City")).toBe("Midnight City");
    expect(csvCell(123)).toBe("123");
  });

  it("quotes values with separators", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=cmd|'/c calc'!A0")).toBe("'=cmd|'/c calc'!A0");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});

describe("safeFileName", () => {
  it("keeps ordinary names", () => {
    expect(safeFileName("Liked Songs")).toBe("Liked Songs");
  });

  it("removes path traversal and separators", () => {
    expect(safeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(safeFileName("a/b\\c")).toBe("a_b_c");
  });

  it("falls back when the name is empty", () => {
    expect(safeFileName("...")).toBe("untitled");
  });
});
