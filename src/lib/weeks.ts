import {
  clampTimezoneOffset,
  DAY_MS,
  formatDay,
  formatDayShort,
  localDay,
} from "./insights";

const isoDayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** An ISO calendar day as UTC epoch days, or null when it is not a real day. */
export function isoDayNumber(day: string): number | null {
  const match = isoDayPattern.exec(day);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, date);
  value.setUTCHours(0, 0, 0, 0);

  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== date
  ) {
    return null;
  }

  return Math.floor(value.getTime() / DAY_MS);
}

export function isoDayFromNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday on or before an ISO day. */
export function startOfWeek(day: string): string | null {
  const value = isoDayNumber(day);

  if (value === null) return null;

  // 1970-01-01 was a Thursday, so three days later is Monday.
  return isoDayFromNumber(value - ((value + 3) % 7));
}

export function shiftWeek(weekStart: string, weeks: number): string | null {
  const monday = startOfWeek(weekStart);
  const value = monday === null ? null : isoDayNumber(monday);

  return value === null ? null : isoDayFromNumber(value + weeks * 7);
}

export function weekKeyFromTimestamp(ms: number, tzOffset: number): string {
  return startOfWeek(localDay(ms, tzOffset)) ?? "1970-01-05";
}

export function currentWeekStart(tzOffset: number, now = Date.now()): string {
  return weekKeyFromTimestamp(now, tzOffset);
}

export interface WeekBounds {
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly fromMs: number;
  readonly toMs: number;
}

/** UTC instant for midnight at the start of an ISO day in a fixed offset. */
export function startOfLocalDayKey(
  day: string,
  tzOffset: number,
): number | null {
  const value = isoDayNumber(day);

  if (value === null) return null;

  return value * DAY_MS + clampTimezoneOffset(tzOffset) * 60_000;
}

/**
 * Bounds for a Monday-start local week. The current week ends at now rather
 * than including future days; completed weeks include all of Sunday.
 */
export function weekBounds(
  weekStart: string,
  tzOffset: number,
  now = Date.now(),
): WeekBounds | null {
  const monday = startOfWeek(weekStart);
  const day = monday === null ? null : isoDayNumber(monday);

  if (monday === null || day === null || monday !== weekStart) return null;

  const fromMs = startOfLocalDayKey(monday, tzOffset);

  if (fromMs === null) return null;

  return {
    weekStart: monday,
    weekEnd: isoDayFromNumber(day + 6),
    fromMs,
    toMs: Math.min(fromMs + 7 * DAY_MS - 1, now),
  };
}

/** A compact, unambiguous label such as "30 Nov – 6 Dec, 2026". */
export function formatWeekRange(weekStart: string): string {
  const end = shiftWeek(weekStart, 1);

  if (end === null) return weekStart;

  const weekEnd = isoDayFromNumber((isoDayNumber(end) ?? 0) - 1);
  const startYear = weekStart.slice(0, 4);
  const endYear = weekEnd.slice(0, 4);

  if (startYear !== endYear) {
    return `${formatDay(weekStart)} – ${formatDay(weekEnd)}`;
  }

  if (weekStart.slice(0, 7) === weekEnd.slice(0, 7)) {
    return `${formatDayShort(weekStart)} – ${Number(weekEnd.slice(8))}, ${startYear}`;
  }

  return `${formatDayShort(weekStart)} – ${formatDayShort(weekEnd)}, ${startYear}`;
}
