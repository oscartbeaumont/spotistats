import { Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";

import {
  type ExportedListen,
  type InsightsQuery,
  type ListeningExport,
  type ListeningInsights,
  type WeeklyAccess,
  type WeeklyHistory,
  type WeeklyHistoryQuery,
  type WeeklyInsights,
  UpstreamError,
} from "~/api";
import { csvCell } from "~/lib/download";
import {
  DAY_MS,
  computeStreaks,
  dayKeysBetween,
  localDay,
  monthKeysBetween,
  resolveStatsWindow,
  shiftMonth,
  timezoneModifier,
} from "~/lib/insights";
import {
  type WeekBounds,
  startOfLocalDayKey,
} from "~/lib/weeks";

/**
 * Read-side queries for the listening history Spotistats owns.
 *
 * All grouping happens in SQLite (through D1) and stays bounded, so a user
 * with years of history never streams every listen into a Worker isolate just
 * to compute a count. Dates are grouped in the user's local timezone.
 */

const databaseError = (message: string) => (cause: { readonly message: string }) =>
  new UpstreamError({
    service: "database",
    message: `${message}: ${cause.message}`,
    status: null,
  });

interface TotalsRow {
  listens: number;
  tracks: number;
  listeningMs: number;
  firstPlayedAtMs: number | null;
  lastPlayedAtMs: number | null;
}

interface ArtistCountRow {
  artists: number;
}

interface TopTrackRow {
  trackId: string;
  name: string;
  artistNames: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
  listens: number;
}

interface TopArtistRow {
  name: string;
  listens: number;
  tracks: number;
}

interface BucketRow {
  bucket: string;
  listens: number;
}

interface TrendRow {
  bucket: string;
  listens: number;
  listeningMs: number;
}

interface DayRow {
  day: string;
  listens: number;
}

interface CountRow {
  count: number;
}

interface StatsBounds {
  readonly spotifyUserId: string;
  readonly fromMs: number;
  readonly toMs: number;
  readonly modifier: string;
}

const readTotals = (sql: SqlClient, bounds: StatsBounds) =>
  Effect.gen(function* () {
    const [totals] = yield* sql<TotalsRow>`
      SELECT
        COUNT(*) AS listens,
        COUNT(DISTINCT l.spotify_track_id) AS tracks,
        COALESCE(SUM(t.duration_ms), 0) AS listeningMs,
        MIN(l.played_at_ms) AS firstPlayedAtMs,
        MAX(l.played_at_ms) AS lastPlayedAtMs
      FROM spotify_listens l
      INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id
      WHERE l.spotify_user_id = ${bounds.spotifyUserId}
        AND l.played_at_ms >= ${bounds.fromMs}
        AND l.played_at_ms <= ${bounds.toMs}
    `.pipe(Effect.mapError(databaseError("Failed to read listening totals")));

    return totals;
  });

const readDays = (sql: SqlClient, bounds: StatsBounds) =>
  sql<DayRow>`
    SELECT
      date(l.played_at_ms / 1000, 'unixepoch', ${bounds.modifier}) AS day,
      COUNT(*) AS listens
    FROM spotify_listens l
    WHERE l.spotify_user_id = ${bounds.spotifyUserId}
      AND l.played_at_ms >= ${bounds.fromMs}
      AND l.played_at_ms <= ${bounds.toMs}
    GROUP BY day
    ORDER BY day ASC
  `.pipe(Effect.mapError(databaseError("Failed to read listening days")));

const readArtistCount = (sql: SqlClient, bounds: StatsBounds) =>
  Effect.gen(function* () {
    const [artistCount] = yield* sql<ArtistCountRow>`
      SELECT COUNT(DISTINCT json_extract(artist.value, '$.name')) AS artists
      FROM spotify_listens l
      INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id,
        json_each(
          CASE WHEN json_valid(t.raw_json) THEN t.raw_json ELSE '{"artists":[]}' END,
          '$.artists'
        ) artist
      WHERE l.spotify_user_id = ${bounds.spotifyUserId}
        AND l.played_at_ms >= ${bounds.fromMs}
        AND l.played_at_ms <= ${bounds.toMs}
    `.pipe(Effect.mapError(databaseError("Failed to count artists")));

    return artistCount;
  });

const readTopTracks = (sql: SqlClient, bounds: StatsBounds) =>
  sql<TopTrackRow>`
    SELECT
      l.spotify_track_id AS trackId,
      t.name AS name,
      t.artist_names AS artistNames,
      t.image_url AS imageUrl,
      t.external_url AS externalUrl,
      COUNT(*) AS listens
    FROM spotify_listens l
    INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id
    WHERE l.spotify_user_id = ${bounds.spotifyUserId}
      AND l.played_at_ms >= ${bounds.fromMs}
      AND l.played_at_ms <= ${bounds.toMs}
    GROUP BY l.spotify_track_id
    ORDER BY listens DESC, t.name ASC
    LIMIT 5
  `.pipe(Effect.mapError(databaseError("Failed to read top tracks")));

const readTopArtists = (sql: SqlClient, bounds: StatsBounds) =>
  sql<TopArtistRow>`
    SELECT
      json_extract(artist.value, '$.name') AS name,
      COUNT(*) AS listens,
      COUNT(DISTINCT l.spotify_track_id) AS tracks
    FROM spotify_listens l
    INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id,
      json_each(
        CASE WHEN json_valid(t.raw_json) THEN t.raw_json ELSE '{"artists":[]}' END,
        '$.artists'
      ) artist
    WHERE l.spotify_user_id = ${bounds.spotifyUserId}
      AND l.played_at_ms >= ${bounds.fromMs}
      AND l.played_at_ms <= ${bounds.toMs}
      AND json_extract(artist.value, '$.name') IS NOT NULL
    GROUP BY 1
    ORDER BY listens DESC, 1 ASC
    LIMIT 5
  `.pipe(Effect.mapError(databaseError("Failed to read top artists")));

const readHourBuckets = (sql: SqlClient, bounds: StatsBounds) =>
  sql<BucketRow>`
    SELECT
      strftime('%H', l.played_at_ms / 1000, 'unixepoch', ${bounds.modifier}) AS bucket,
      COUNT(*) AS listens
    FROM spotify_listens l
    WHERE l.spotify_user_id = ${bounds.spotifyUserId}
      AND l.played_at_ms >= ${bounds.fromMs}
      AND l.played_at_ms <= ${bounds.toMs}
    GROUP BY bucket
  `.pipe(Effect.mapError(databaseError("Failed to read hourly listening")));

const readWeekdayBuckets = (sql: SqlClient, bounds: StatsBounds) =>
  sql<BucketRow>`
    SELECT
      CAST(
        (CAST(strftime('%w', l.played_at_ms / 1000, 'unixepoch', ${bounds.modifier}) AS INTEGER) + 6) % 7
        AS TEXT
      ) AS bucket,
      COUNT(*) AS listens
    FROM spotify_listens l
    WHERE l.spotify_user_id = ${bounds.spotifyUserId}
      AND l.played_at_ms >= ${bounds.fromMs}
      AND l.played_at_ms <= ${bounds.toMs}
    GROUP BY bucket
  `.pipe(Effect.mapError(databaseError("Failed to read weekly listening")));

const readTrendRows = (
  sql: SqlClient,
  bounds: StatsBounds,
  trendUnit: "day" | "month",
) =>
  trendUnit === "day"
    ? sql<TrendRow>`
        SELECT
          date(l.played_at_ms / 1000, 'unixepoch', ${bounds.modifier}) AS bucket,
          COUNT(*) AS listens,
          COALESCE(SUM(t.duration_ms), 0) AS listeningMs
        FROM spotify_listens l
        INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id
        WHERE l.spotify_user_id = ${bounds.spotifyUserId}
          AND l.played_at_ms >= ${bounds.fromMs}
          AND l.played_at_ms <= ${bounds.toMs}
        GROUP BY bucket
      `.pipe(Effect.mapError(databaseError("Failed to read daily listening")))
    : sql<TrendRow>`
        SELECT
          strftime('%Y-%m', l.played_at_ms / 1000, 'unixepoch', ${bounds.modifier}) AS bucket,
          COUNT(*) AS listens,
          COALESCE(SUM(t.duration_ms), 0) AS listeningMs
        FROM spotify_listens l
        INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id
        WHERE l.spotify_user_id = ${bounds.spotifyUserId}
          AND l.played_at_ms >= ${bounds.fromMs}
          AND l.played_at_ms <= ${bounds.toMs}
        GROUP BY bucket
      `.pipe(Effect.mapError(databaseError("Failed to read monthly listening")));

const readOnePlayCount = (sql: SqlClient, bounds: StatsBounds) =>
  Effect.gen(function* () {
    const [onePlay] = yield* sql<CountRow>`
      SELECT COUNT(*) AS count FROM (
        SELECT spotify_track_id
        FROM spotify_listens
        WHERE spotify_user_id = ${bounds.spotifyUserId}
          AND played_at_ms >= ${bounds.fromMs}
          AND played_at_ms <= ${bounds.toMs}
        GROUP BY spotify_track_id
        HAVING COUNT(*) = 1
      )
    `.pipe(Effect.mapError(databaseError("Failed to count one-play tracks")));

    return onePlay;
  });

/** Fills a fixed-size bucket array from SQL rows, ignoring out-of-range keys. */
function bucketCounts(rows: ReadonlyArray<BucketRow>, size: number): number[] {
  const counts = Array.from({ length: size }, () => 0);

  rows.forEach((row) => {
    const bucket = Number(row.bucket);

    if (Number.isInteger(bucket) && bucket >= 0 && bucket < size) {
      counts[bucket] = row.listens;
    }
  });

  return counts;
}

interface ListeningRows {
  readonly totals: TotalsRow | undefined;
  readonly days: ReadonlyArray<DayRow>;
  readonly artistCount: ArtistCountRow | undefined;
  readonly topTracks: ReadonlyArray<TopTrackRow>;
  readonly topArtists: ReadonlyArray<TopArtistRow>;
  readonly hourRows: ReadonlyArray<BucketRow>;
  readonly weekdayRows: ReadonlyArray<BucketRow>;
  readonly trendRows: ReadonlyArray<TrendRow>;
  readonly onePlay: CountRow | undefined;
}

interface InsightsWindow {
  readonly now: number;
  readonly tzOffset: number;
  readonly fromMs: number;
  readonly toMs: number;
  readonly trendUnit: "day" | "month";
}

function buildListeningInsights(
  rows: ListeningRows,
  window: InsightsWindow,
): ListeningInsights {
  const hours = bucketCounts(rows.hourRows, 24);
  const weekdays = bucketCounts(rows.weekdayRows, 7);

  const busiestDay = rows.days.reduce<DayRow | null>(
    (best, row) => (best === null || row.listens > best.listens ? row : best),
    null,
  );

  const endDay = localDay(window.toMs, window.tzOffset);
  const endMonth = endDay.slice(0, 7);

  const trendKeys =
    window.trendUnit === "day"
      ? dayKeysBetween(localDay(window.fromMs, window.tzOffset), endDay)
      : monthKeysBetween(
          window.fromMs === 0
            ? shiftMonth(endMonth, -11)
            : localDay(window.fromMs, window.tzOffset).slice(0, 7),
          endMonth,
          36,
        );

  const trendCounts = new Map(rows.trendRows.map((row) => [row.bucket, row]));

  const trend = trendKeys.map((bucket) => ({
    bucket,
    listens: trendCounts.get(bucket)?.listens ?? 0,
    listeningMs: trendCounts.get(bucket)?.listeningMs ?? 0,
  }));

  return {
    generatedAt: window.now,
    totals: {
      listens: rows.totals?.listens ?? 0,
      tracks: rows.totals?.tracks ?? 0,
      artists: rows.artistCount?.artists ?? 0,
      listeningMs: rows.totals?.listeningMs ?? 0,
      activeDays: rows.days.length,
      firstPlayedAtMs: rows.totals?.firstPlayedAtMs ?? null,
      lastPlayedAtMs: rows.totals?.lastPlayedAtMs ?? null,
    },
    streak: computeStreaks(
      rows.days.map((row) => row.day),
      endDay,
    ),
    hours,
    weekdays,
    trend,
    trendUnit: window.trendUnit,
    topTracks: rows.topTracks.map((row) => ({
      trackId: row.trackId,
      name: row.name,
      artistNames: row.artistNames,
      imageUrl: row.imageUrl,
      externalUrl: row.externalUrl,
      listens: row.listens,
    })),
    topArtists: rows.topArtists,
    onePlayTracks: rows.onePlay?.count ?? 0,
    lateNightListens:
      (hours[22] ?? 0) + (hours[23] ?? 0) + (hours[0] ?? 0) +
      (hours[1] ?? 0) + (hours[2] ?? 0) + (hours[3] ?? 0) + (hours[4] ?? 0),
    busiestDay: busiestDay
      ? { date: busiestDay.day, listens: busiestDay.listens }
      : null,
  } satisfies ListeningInsights;
}

export const readInsights = (
  sql: SqlClient,
  spotifyUserId: string,
  query: InsightsQuery,
) =>
  Effect.gen(function* () {
    const now = Date.now();

    const { fromMs, toMs } = resolveStatsWindow({
      range: query.range,
      tzOffset: query.tzOffset,
      fromMs: query.fromMs,
      toMs: query.toMs,
      now,
    });

    const modifier = timezoneModifier(query.tzOffset);
    const trendUnit = toMs - fromMs <= 31 * DAY_MS ? "day" : "month";
    const bounds = { spotifyUserId, fromMs, toMs, modifier };

    const rows: ListeningRows = {
      totals: yield* readTotals(sql, bounds),
      days: yield* readDays(sql, bounds),
      artistCount: yield* readArtistCount(sql, bounds),
      topTracks: yield* readTopTracks(sql, bounds),
      topArtists: yield* readTopArtists(sql, bounds),
      hourRows: yield* readHourBuckets(sql, bounds),
      weekdayRows: yield* readWeekdayBuckets(sql, bounds),
      trendRows: yield* readTrendRows(sql, bounds, trendUnit),
      onePlay: yield* readOnePlayCount(sql, bounds),
    };

    return buildListeningInsights(rows, {
      now,
      tzOffset: query.tzOffset,
      fromMs,
      toMs,
      trendUnit,
    });
  });

/** A read-only gate check: unlike status(), this never marks dashboard activity. */
export const readWeeklyAccess = (
  sql: SqlClient,
  spotifyUserId: string,
) =>
  Effect.gen(function* () {
    const [row] = yield* sql<{
      enabled: number;
      firstPlayedAtMs: number | null;
    }>`
      SELECT
        u.enabled AS enabled,
        (
          SELECT MIN(l.played_at_ms)
          FROM spotify_listens l
          WHERE l.spotify_user_id = u.spotify_user_id
        ) AS firstPlayedAtMs
      FROM spotify_tracking_users u
      WHERE u.spotify_user_id = ${spotifyUserId}
      LIMIT 1
    `.pipe(Effect.mapError(databaseError("Failed to read weekly stats access")));

    return {
      enabled: row?.enabled === 1,
      firstPlayedAtMs: row?.firstPlayedAtMs ?? null,
    } satisfies WeeklyAccess;
  });

interface WeeklySummaryRow {
  weekStart: string;
  listens: number;
  tracks: number;
  listeningMs: number;
  activeDays: number;
}

/** Observed Monday-start weeks, newest first, paged without N+1 queries. */
export const readWeeklyHistory = (
  sql: SqlClient,
  spotifyUserId: string,
  query: WeeklyHistoryQuery,
) =>
  Effect.gen(function* () {
    const beforeMs =
      query.before === null
        ? null
        : startOfLocalDayKey(query.before, query.tzOffset);
    const modifier = timezoneModifier(query.tzOffset);
    const rows = yield* sql<WeeklySummaryRow>`
      SELECT
        weekStart,
        COUNT(*) AS listens,
        COUNT(DISTINCT spotifyTrackId) AS tracks,
        COALESCE(SUM(durationMs), 0) AS listeningMs,
        COUNT(DISTINCT day) AS activeDays
      FROM (
        SELECT
          date(l.played_at_ms / 1000, 'unixepoch', ${modifier}, 'weekday 0', '-6 days') AS weekStart,
          date(l.played_at_ms / 1000, 'unixepoch', ${modifier}) AS day,
          l.spotify_track_id AS spotifyTrackId,
          t.duration_ms AS durationMs
        FROM spotify_listens l
        INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id
        WHERE l.spotify_user_id = ${spotifyUserId}
          AND (${beforeMs} IS NULL OR l.played_at_ms < ${beforeMs})
      )
      GROUP BY weekStart
      ORDER BY weekStart DESC
      LIMIT ${query.limit + 1}
    `.pipe(Effect.mapError(databaseError("Failed to read weekly listening history")));

    return {
      weeks: rows.slice(0, query.limit),
      hasMore: rows.length > query.limit,
    } satisfies WeeklyHistory;
  });

export const readWeeklyInsights = (
  sql: SqlClient,
  spotifyUserId: string,
  bounds: WeekBounds,
  tzOffset: number,
  now = Date.now(),
) =>
  readInsights(sql, spotifyUserId, {
    tzOffset,
    range: "custom",
    fromMs: bounds.fromMs,
    toMs: bounds.toMs,
  }).pipe(
    Effect.map(
      (insights): WeeklyInsights => ({
        weekStart: bounds.weekStart,
        weekEnd: bounds.weekEnd,
        isPartial: bounds.toMs < bounds.fromMs + 7 * DAY_MS - 1,
        insights: { ...insights, generatedAt: now },
      }),
    ),
  );


interface ExportRow {
  id: string;
  playedAt: string;
  playedAtMs: number;
  trackId: string;
  trackName: string;
  artistNames: string | null;
  albumName: string | null;
  durationMs: number | null;
  contextType: string | null;
  contextUri: string | null;
  externalUrl: string | null;
}

const exportPageSize = 500;

/**
 * Reads every listen in pages. D1 caps a result set, and an export must stay
 * complete, so the offsets walk forward until a short page ends the loop.
 */
const readExportRows = (sql: SqlClient, spotifyUserId: string) =>
  Effect.gen(function* () {
    const rows: ExportedListen[] = [];

    for (let offset = 0; ; offset += exportPageSize) {
      const page = yield* sql<ExportRow>`
        SELECT
          l.id AS id,
          l.played_at AS playedAt,
          l.played_at_ms AS playedAtMs,
          l.spotify_track_id AS trackId,
          t.name AS trackName,
          t.artist_names AS artistNames,
          t.album_name AS albumName,
          t.duration_ms AS durationMs,
          l.context_type AS contextType,
          l.context_uri AS contextUri,
          t.external_url AS externalUrl
        FROM spotify_listens l
        INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id
        WHERE l.spotify_user_id = ${spotifyUserId}
        ORDER BY l.played_at_ms ASC, l.id ASC
        LIMIT ${exportPageSize} OFFSET ${offset}
      `.pipe(Effect.mapError(databaseError("Failed to read the listening export")));

      rows.push(...page);

      if (page.length < exportPageSize) break;
    }

    return rows;
  });

export const readExport = (sql: SqlClient, spotifyUserId: string) =>
  Effect.gen(function* () {
    const listens = yield* readExportRows(sql, spotifyUserId);

    return {
      exportedAt: Date.now(),
      spotifyUserId,
      listenCount: listens.length,
      listens,
    } satisfies ListeningExport;
  });

const csvHeader =
  "Listen ID,Played At (UTC),Track ID,Track Name,Artist Names,Album,Duration (ms),Context Type,Context URI,Spotify URL\n";

export const exportCsv = (sql: SqlClient, spotifyUserId: string) =>
  readExportRows(sql, spotifyUserId).pipe(
    Effect.map((rows) => {
      let csv = csvHeader;

      for (const row of rows) {
        csv +=
          [
            row.id,
            row.playedAt,
            row.trackId,
            row.trackName,
            row.artistNames,
            row.albumName,
            row.durationMs,
            row.contextType,
            row.contextUri,
            row.externalUrl,
          ]
            .map(csvCell)
            .join(",") + "\n";
      }

      return csv;
    }),
  );
