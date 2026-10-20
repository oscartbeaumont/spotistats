/** Pure helpers shared by the listening-insights page and its tests. */

/** Minutes between UTC and local time, clamped to the real-world range. */
export function clampTimezoneOffset(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(-14 * 60, Math.min(14 * 60, Math.round(value)));
}

/** The SQLite modifier that turns a UTC timestamp into local time. */
export function timezoneModifier(value: number | undefined) {
  const offset = clampTimezoneOffset(value);
  return `${-offset} minutes`;
}

const dayNumber = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1) / 86_400_000);
};

/**
 * Current and longest runs of consecutive listening days.
 *
 * The current streak survives a day with no listening yet: a run that ends
 * yesterday is still current until today is over. `today` and the days are
 * local `YYYY-MM-DD` strings.
 */
export function computeStreaks(
  days: ReadonlyArray<string>,
  today: string,
): { current: number; longest: number; longestEndedOn: string | null } {
  const unique = [...new Set(days)].sort();
  if (unique.length === 0) return { current: 0, longest: 0, longestEndedOn: null };

  let longest = 0;
  let longestEndedOn: string | null = null;
  let run = 0;
  let previous = Number.NaN;

  for (const day of unique) {
    const value = dayNumber(day);
    run = Number.isFinite(previous) && value === previous + 1 ? run + 1 : 1;
    // A later run wins a tie so the highlight shows the most recent record.
    if (run >= longest) {
      longest = run;
      longestEndedOn = day;
    }
    previous = value;
  }

  const last = unique[unique.length - 1];
  const gapFromToday = last === undefined ? Number.NaN : dayNumber(today) - dayNumber(last);
  let current = 0;
  if (gapFromToday === 0 || gapFromToday === 1) {
    current = 1;
    for (let index = unique.length - 1; index > 0; index -= 1) {
      const next = unique[index];
      const previousDay = unique[index - 1];
      if (!next || !previousDay) break;
      if (dayNumber(next) - dayNumber(previousDay) !== 1) break;
      current += 1;
    }
  }

  return { current, longest, longestEndedOn };
}

/** Formats milliseconds as a compact `12h 34m` listening-time label. */
export function formatListeningTime(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Hours with one decimal, for the big overview number. */
export function listeningHours(ms: number) {
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export function percentage(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** Index of the largest value, or `null` when everything is zero. */
export function busiestIndex(values: ReadonlyArray<number>) {
  let best: number | null = null;
  for (const [index, value] of values.entries()) {
    if (value > 0 && (best === null || value > (values[best] ?? 0))) best = index;
  }
  return best;
}

export function formatHour(hour: number) {
  const value = ((hour % 24) + 24) % 24;
  const suffix = value < 12 ? "am" : "pm";
  const twelve = value % 12 === 0 ? 12 : value % 12;
  return `${twelve}${suffix}`;
}

export const weekdayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function formatMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  if (!year || !value) return month;
  return new Date(Date.UTC(year, value - 1, 1)).toLocaleDateString(undefined, {
    month: "short",
    timeZone: "UTC",
  });
}

/** Local `YYYY-MM-DD` for a UTC timestamp, independent of the runtime's zone. */
export function localDay(now: number, tzOffset: number) {
  return new Date(now - clampTimezoneOffset(tzOffset) * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Formats an ISO `YYYY-MM-DD` day without a timezone shift. */
export function formatDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Reads the browser's UTC offset in the shape the API expects. */
export function browserTimezoneOffset() {
  return typeof Date === "undefined" ? 0 : new Date().getTimezoneOffset();
}

export const DAY_MS = 86_400_000;

export const insightsRanges = [
  "all",
  "week",
  "month",
  "sixMonths",
  "custom",
] as const;
export type InsightsRange = (typeof insightsRanges)[number];

export interface StatsWindow {
  readonly fromMs: number;
  readonly toMs: number;
}

/** The first instant of the local day containing `ms`. */
export function startOfLocalDay(ms: number, tzOffset: number) {
  const offset = clampTimezoneOffset(tzOffset);
  const local = ms - offset * 60_000;
  return Math.floor(local / DAY_MS) * DAY_MS + offset * 60_000;
}

/**
 * Turns a range choice into concrete UTC bounds. Presets start at local
 * midnight so "last 7 days" is exactly seven local calendar days, and custom
 * ranges are clamped to the past.
 */
export function resolveStatsWindow(
  range: InsightsRange,
  tzOffset: number,
  fromMs: number | null = null,
  toMs: number | null = null,
  now = Date.now(),
): StatsWindow {
  const today = startOfLocalDay(now, tzOffset);
  switch (range) {
    case "week":
      return { fromMs: today - 6 * DAY_MS, toMs: now };
    case "month":
      return { fromMs: today - 29 * DAY_MS, toMs: now };
    case "sixMonths":
      return { fromMs: today - 182 * DAY_MS, toMs: now };
    case "custom": {
      const rawFrom = fromMs ?? today - 29 * DAY_MS;
      const rawTo = Math.min(toMs ?? now, now);
      return rawFrom <= rawTo
        ? { fromMs: Math.max(0, rawFrom), toMs: rawTo }
        : { fromMs: Math.max(0, rawTo), toMs: Math.min(rawFrom, now) };
    }
    default:
      return { fromMs: 0, toMs: now };
  }
}

const dayKey = (day: number) =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Every local day between two `YYYY-MM-DD` strings, inclusive. */
export function dayKeysBetween(start: string, end: string) {
  const first = dayNumber(start);
  const last = dayNumber(end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) {
    return [];
  }
  return Array.from(
    { length: Math.min(last - first + 1, 366) },
    (_, index) => dayKey(first + index),
  );
}

/** Shifts a `YYYY-MM` key by a number of months. */
export function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split("-").map(Number);
  if (!year || !value) return month;
  const index = year * 12 + (value - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Every month between two `YYYY-MM` strings, capped to the latest entries. */
export function monthKeysBetween(start: string, end: string, max = 36) {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) return [];
  const startIndex = startYear * 12 + (startMonth - 1);
  const endIndex = endYear * 12 + (endMonth - 1);
  if (endIndex < startIndex) return [];
  const first = Math.max(startIndex, endIndex - (max - 1));
  return Array.from({ length: endIndex - first + 1 }, (_, index) => {
    const value = first + index;
    return `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
  });
}

/** Short day label for daily trend charts, e.g. `20 Oct`. */
export function formatDayShort(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
