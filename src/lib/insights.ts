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
