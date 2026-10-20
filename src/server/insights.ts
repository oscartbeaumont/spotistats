import { Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";

import {
  type ExportedListen,
  type ListeningExport,
  type ListeningInsights,
  UpstreamError,
} from "~/api";
import { csvCell } from "~/lib/download";
import {
  computeStreaks,
  localDay,
  timezoneModifier,
} from "~/lib/insights";

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

interface DayRow {
  day: string;
  listens: number;
}

interface CountRow {
  count: number;
}

export const readInsights = (
  sql: SqlClient,
  spotifyUserId: string,
  tzOffset: number,
) =>
  Effect.gen(function* () {
    const now = Date.now();
    const modifier = timezoneModifier(tzOffset);

    const [totals] = yield* sql<TotalsRow>`
      SELECT
        COUNT(*) AS listens,
        COUNT(DISTINCT l.spotify_track_id) AS tracks,
        COALESCE(SUM(t.duration_ms), 0) AS listeningMs,
        MIN(l.played_at_ms) AS firstPlayedAtMs,
        MAX(l.played_at_ms) AS lastPlayedAtMs
      FROM spotify_listens l
      INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id
      WHERE l.spotify_user_id = ${spotifyUserId}
    `.pipe(Effect.mapError(databaseError("Failed to read listening totals")));

    const days = yield* sql<DayRow>`
      SELECT
        date(l.played_at_ms / 1000, 'unixepoch', ${modifier}) AS day,
        COUNT(*) AS listens
      FROM spotify_listens l
      WHERE l.spotify_user_id = ${spotifyUserId}
      GROUP BY day
      ORDER BY day ASC
    `.pipe(Effect.mapError(databaseError("Failed to read listening days")));

    // `json_each` expands a collaboration into one row per credited artist, so
    // featuring artists count as artists people actually listened to.
    const [artistCount] = yield* sql<ArtistCountRow>`
      SELECT COUNT(DISTINCT json_extract(artist.value, '$.name')) AS artists
      FROM spotify_listens l
      INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id,
        json_each(
          CASE WHEN json_valid(t.raw_json) THEN t.raw_json ELSE '{"artists":[]}' END,
          '$.artists'
        ) artist
      WHERE l.spotify_user_id = ${spotifyUserId}
    `.pipe(Effect.mapError(databaseError("Failed to count artists")));

    const topTracks = yield* sql<TopTrackRow>`
      SELECT
        l.spotify_track_id AS trackId,
        t.name AS name,
        t.artist_names AS artistNames,
        t.image_url AS imageUrl,
        t.external_url AS externalUrl,
        COUNT(*) AS listens
      FROM spotify_listens l
      INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id
      WHERE l.spotify_user_id = ${spotifyUserId}
      GROUP BY l.spotify_track_id
      ORDER BY listens DESC, t.name ASC
      LIMIT 5
    `.pipe(Effect.mapError(databaseError("Failed to read top tracks")));

    const topArtists = yield* sql<TopArtistRow>`
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
      WHERE l.spotify_user_id = ${spotifyUserId}
        AND json_extract(artist.value, '$.name') IS NOT NULL
      GROUP BY 1
      ORDER BY listens DESC, 1 ASC
      LIMIT 5
    `.pipe(Effect.mapError(databaseError("Failed to read top artists")));

    const hourRows = yield* sql<BucketRow>`
      SELECT
        strftime('%H', l.played_at_ms / 1000, 'unixepoch', ${modifier}) AS bucket,
        COUNT(*) AS listens
      FROM spotify_listens l
      WHERE l.spotify_user_id = ${spotifyUserId}
      GROUP BY bucket
    `.pipe(Effect.mapError(databaseError("Failed to read hourly listening")));

    const weekdayRows = yield* sql<BucketRow>`
      SELECT
        CAST(
          (CAST(strftime('%w', l.played_at_ms / 1000, 'unixepoch', ${modifier}) AS INTEGER) + 6) % 7
          AS TEXT
        ) AS bucket,
        COUNT(*) AS listens
      FROM spotify_listens l
      WHERE l.spotify_user_id = ${spotifyUserId}
      GROUP BY bucket
    `.pipe(Effect.mapError(databaseError("Failed to read weekly listening")));

    const monthRows = yield* sql<BucketRow>`
      SELECT
        strftime('%Y-%m', l.played_at_ms / 1000, 'unixepoch', ${modifier}) AS bucket,
        COUNT(*) AS listens
      FROM spotify_listens l
      WHERE l.spotify_user_id = ${spotifyUserId}
      GROUP BY bucket
      ORDER BY bucket DESC
      LIMIT 12
    `.pipe(Effect.mapError(databaseError("Failed to read monthly listening")));

    const [onePlay] = yield* sql<CountRow>`
      SELECT COUNT(*) AS count FROM (
        SELECT spotify_track_id
        FROM spotify_listens
        WHERE spotify_user_id = ${spotifyUserId}
        GROUP BY spotify_track_id
        HAVING COUNT(*) = 1
      )
    `.pipe(Effect.mapError(databaseError("Failed to count one-play tracks")));

    const hours = Array.from({ length: 24 }, () => 0);
    for (const row of hourRows) {
      const hour = Number(row.bucket);
      if (Number.isInteger(hour) && hour >= 0 && hour < 24) hours[hour] = row.listens;
    }

    const weekdays = Array.from({ length: 7 }, () => 0);
    for (const row of weekdayRows) {
      const day = Number(row.bucket);
      if (Number.isInteger(day) && day >= 0 && day < 7) weekdays[day] = row.listens;
    }

    const busiestDay = days.reduce<DayRow | null>(
      (best, row) => (best === null || row.listens > best.listens ? row : best),
      null,
    );

    return {
      generatedAt: now,
      totals: {
        listens: totals?.listens ?? 0,
        tracks: totals?.tracks ?? 0,
        artists: artistCount?.artists ?? 0,
        listeningMs: totals?.listeningMs ?? 0,
        activeDays: days.length,
        firstPlayedAtMs: totals?.firstPlayedAtMs ?? null,
        lastPlayedAtMs: totals?.lastPlayedAtMs ?? null,
      },
      streak: computeStreaks(
        days.map((row) => row.day),
        localDay(now, tzOffset),
      ),
      hours,
      weekdays,
      months: monthRows
        .map((row) => ({ month: row.bucket, listens: row.listens }))
        .reverse(),
      topTracks: topTracks.map((row) => ({
        trackId: row.trackId,
        name: row.name,
        artistNames: row.artistNames,
        imageUrl: row.imageUrl,
        externalUrl: row.externalUrl,
        listens: row.listens,
      })),
      topArtists,
      onePlayTracks: onePlay?.count ?? 0,
      lateNightListens:
        (hours[22] ?? 0) + (hours[23] ?? 0) + (hours[0] ?? 0) +
        (hours[1] ?? 0) + (hours[2] ?? 0) + (hours[3] ?? 0) + (hours[4] ?? 0),
      busiestDay: busiestDay
        ? { date: busiestDay.day, listens: busiestDay.listens }
        : null,
    } satisfies ListeningInsights;
  });

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
