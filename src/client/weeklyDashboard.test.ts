import { describe, expect, it } from "vitest";

import { parseHistoryPage } from "./weeklyDashboard";

describe("parseHistoryPage", () => {
  it("accepts positive integer query values", () => {
    expect(parseHistoryPage("1")).toBe(1);
    expect(parseHistoryPage("2")).toBe(2);
    expect(parseHistoryPage("002")).toBe(2);
  });

  it("falls back to the first page for missing or invalid values", () => {
    expect(parseHistoryPage(undefined)).toBe(1);
    expect(parseHistoryPage("")).toBe(1);
    expect(parseHistoryPage("0")).toBe(1);
    expect(parseHistoryPage("-1")).toBe(1);
    expect(parseHistoryPage("1.5")).toBe(1);
    expect(parseHistoryPage("999999999999999999999")).toBe(1);
  });
});
