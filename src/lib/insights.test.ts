import { describe, expect, it } from "vitest";

import {
  busiestIndex,
  clampTimezoneOffset,
  computeStreaks,
  formatDay,
  formatHour,
  formatListeningTime,
  listeningHours,
  localDay,
  percentage,
  timezoneModifier,
} from "./insights";

describe("computeStreaks", () => {
  it("counts runs that end today", () => {
    expect(
      computeStreaks(["2026-10-18", "2026-10-19", "2026-10-20"], "2026-10-20"),
    ).toEqual({ current: 3, longest: 3, longestEndedOn: "2026-10-20" });
  });

  it("keeps a streak alive until today ends", () => {
    expect(
      computeStreaks(["2026-10-18", "2026-10-19"], "2026-10-20").current,
    ).toBe(2);
  });

  it("breaks a streak after a missed day", () => {
    expect(
      computeStreaks(["2026-10-15", "2026-10-16"], "2026-10-20").current,
    ).toBe(0);
  });

  it("reports the longest past run", () => {
    expect(
      computeStreaks(
        [
          "2026-01-01",
          "2026-01-02",
          "2026-01-03",
          "2026-01-04",
          "2026-02-01",
          "2026-02-02",
        ],
        "2026-03-01",
      ),
    ).toEqual({ current: 0, longest: 4, longestEndedOn: "2026-01-04" });
  });

  it("ignores duplicates and handles no history", () => {
    expect(
      computeStreaks(["2026-10-19", "2026-10-19"], "2026-10-19").current,
    ).toBe(1);
    expect(computeStreaks([], "2026-10-19")).toEqual({
      current: 0,
      longest: 0,
      longestEndedOn: null,
    });
  });

  it("crosses month and year boundaries", () => {
    expect(
      computeStreaks(["2025-12-31", "2026-01-01", "2026-01-02"], "2026-01-02")
        .current,
    ).toBe(3);
  });
});

describe("timezone handling", () => {
  it("clamps offsets to real-world timezones", () => {
    expect(clampTimezoneOffset(-900)).toBe(-840);
    expect(clampTimezoneOffset(900)).toBe(840);
    expect(clampTimezoneOffset(Number.NaN)).toBe(0);
  });

  it("flips the browser offset into a SQLite modifier", () => {
    expect(timezoneModifier(-600)).toBe("600 minutes");
    expect(timezoneModifier(330)).toBe("-330 minutes");
  });

  it("derives the local day from a UTC instant", () => {
    expect(localDay(Date.UTC(2026, 9, 20, 3, 0), -600)).toBe("2026-10-20");
    expect(localDay(Date.UTC(2026, 9, 20, 20, 0), -600)).toBe("2026-10-21");
  });
});

describe("formatting", () => {
  it("formats listening time", () => {
    expect(formatListeningTime(0)).toBe("0m");
    expect(formatListeningTime(59_000)).toBe("1m");
    expect(formatListeningTime(3_600_000)).toBe("1h");
    expect(formatListeningTime(45_240_000)).toBe("12h 34m");
  });

  it("formats days without a timezone shift", () => {
    expect(formatDay("2025-12-14")).toContain("2025");
    expect(formatDay("not-a-day")).toBe("not-a-day");
  });

  it("rounds hours to one decimal", () => {
    expect(listeningHours(5_400_000)).toBe(1.5);
  });

  it("formats hours on a 12-hour clock", () => {
    expect(formatHour(0)).toBe("12am");
    expect(formatHour(9)).toBe("9am");
    expect(formatHour(12)).toBe("12pm");
    expect(formatHour(23)).toBe("11pm");
  });

  it("computes percentages and busiest buckets", () => {
    expect(percentage(1, 4)).toBe(25);
    expect(percentage(1, 0)).toBe(0);
    expect(busiestIndex([0, 3, 1])).toBe(1);
    expect(busiestIndex([0, 0])).toBeNull();
  });
});
