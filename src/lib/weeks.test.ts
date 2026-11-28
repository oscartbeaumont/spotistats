import { describe, expect, it } from "vitest";

import { DAY_MS } from "./insights";
import {
  currentWeekStart,
  formatWeekRange,
  isoDayNumber,
  shiftWeek,
  startOfWeek,
  weekBounds,
  weekKeyFromTimestamp,
} from "./weeks";

describe("weekly listening dates", () => {
  it("validates real ISO days without Date's year-zero shortcut", () => {
    expect(isoDayNumber("2024-02-29")).not.toBeNull();
    expect(isoDayNumber("2025-02-29")).toBeNull();
    expect(isoDayNumber("2026-13-01")).toBeNull();
    expect(isoDayNumber("not-a-day")).toBeNull();
  });

  it("normalizes to Monday across months and years", () => {
    expect(startOfWeek("2026-11-22")).toBe("2026-11-16");
    expect(startOfWeek("2027-01-01")).toBe("2026-12-28");
    expect(startOfWeek("2026-12-28")).toBe("2026-12-28");
    expect(shiftWeek("2026-12-28", -1)).toBe("2026-12-21");
    expect(shiftWeek("2024-02-26", 1)).toBe("2024-03-04");
  });

  it("groups timestamps using the supplied fixed local offset", () => {
    // Monday 00:30 in New York is still Sunday in UTC.
    expect(
      weekKeyFromTimestamp(Date.UTC(2026, 10, 23, 4, 30), 300),
    ).toBe("2026-11-16");
    // Sunday 23:30 in Tokyo is still Sunday in UTC.
    expect(
      weekKeyFromTimestamp(Date.UTC(2026, 10, 22, 14, 30), -540),
    ).toBe("2026-11-16");
    expect(currentWeekStart(0, Date.UTC(2026, 11, 31, 12))).toBe(
      "2026-12-28",
    );
  });

  it("includes all of Sunday for a completed week", () => {
    const now = Date.UTC(2026, 11, 31, 12);
    const bounds = weekBounds("2026-11-16", 0, now);

    expect(bounds).toEqual({
      weekStart: "2026-11-16",
      weekEnd: "2026-11-22",
      fromMs: Date.UTC(2026, 10, 16),
      toMs: Date.UTC(2026, 10, 22, 23, 59, 59, 999),
    });
  });

  it("starts Monday at local midnight east and west of UTC", () => {
    expect(weekBounds("2026-11-16", 300)?.fromMs).toBe(
      Date.UTC(2026, 10, 16, 5),
    );
    expect(weekBounds("2026-11-16", 300)?.toMs).toBe(
      Date.UTC(2026, 10, 23, 4, 59, 59, 999),
    );
    expect(weekBounds("2026-11-16", -330)?.fromMs).toBe(
      Date.UTC(2026, 10, 15, 18, 30),
    );
    expect(weekBounds("2026-11-16", -330)?.toMs).toBe(
      Date.UTC(2026, 10, 22, 18, 29, 59, 999),
    );
  });

  it("clamps the current week to now and rejects non-Mondays", () => {
    const now = Date.UTC(2026, 10, 18, 12);
    const bounds = weekBounds("2026-11-16", 0, now);

    expect(bounds?.toMs).toBe(now);
    if (bounds === null) throw new Error("Expected current-week bounds");
    expect(bounds.toMs - bounds.fromMs).toBeLessThan(7 * DAY_MS);
    expect(weekBounds("2026-11-17", 0, now)).toBeNull();
    expect(weekBounds("2026-02-30", 0, now)).toBeNull();
  });

  it("formats week ranges compactly", () => {
    const sameMonth = formatWeekRange("2026-11-16");
    const acrossMonths = formatWeekRange("2026-11-30");
    const acrossYears = formatWeekRange("2026-12-28");

    expect(sameMonth.match(/2026/g)).toHaveLength(1);
    expect(sameMonth).toContain("–");
    expect(acrossMonths.match(/2026/g)).toHaveLength(1);
    expect(acrossYears).toContain("2026");
    expect(acrossYears).toContain("2027");
  });
});
