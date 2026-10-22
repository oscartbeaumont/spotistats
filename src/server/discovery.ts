import { Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";

import { type DiscoveryHistory, type DiscoveryTrack, UpstreamError } from "~/api";

const databaseError = (cause: { readonly message: string }) =>
  new UpstreamError({ service: "database", message: `Could not read discovery history: ${cause.message}`, status: null });

export const readDiscoveryHistory = Effect.fn("readDiscoveryHistory")(function* (sql: SqlClient, userId: string, now = Date.now()) {
  const seeds = yield* sql<{ id: string }>`
    SELECT spotify_track_id AS id FROM spotify_listens
    WHERE spotify_user_id = ${userId}
    GROUP BY spotify_track_id ORDER BY COUNT(*) DESC, MAX(played_at_ms) DESC, spotify_track_id ASC
    LIMIT 5
  `.pipe(Effect.mapError(databaseError));
  const rediscovery = yield* sql<DiscoveryTrack>`
    SELECT t.spotify_track_id AS id, t.name AS name,
      COALESCE(t.artist_names, '') AS artistNames, t.image_url AS imageUrl,
      t.external_url AS externalUrl, COUNT(*) AS listens, MAX(l.played_at_ms) AS lastPlayedAtMs
    FROM spotify_listens l JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id
    WHERE l.spotify_user_id = ${userId}
    GROUP BY l.spotify_track_id
    HAVING COUNT(*) >= 2 AND MAX(l.played_at_ms) < ${now - 90 * 86_400_000}
    ORDER BY COUNT(*) DESC, MAX(l.played_at_ms) ASC, l.spotify_track_id ASC
    LIMIT 100
  `.pipe(Effect.mapError(databaseError));
  return { seeds: seeds.map((row) => row.id), rediscovery } satisfies DiscoveryHistory;
});

export const readKnownTracks = Effect.fn("readKnownTracks")(function* (sql: SqlClient, userId: string, ids: readonly string[]) {
  const known: string[] = [];
  // D1 permits 100 bindings per statement; leave room for the account filter.
  for (let offset = 0; offset < ids.length; offset += 90) {
    const rows = yield* sql<{ id: string }>`
      SELECT DISTINCT spotify_track_id AS id FROM spotify_listens
      WHERE spotify_user_id = ${userId} AND ${sql.in("spotify_track_id", ids.slice(offset, offset + 90))}
    `.pipe(Effect.mapError(databaseError));
    known.push(...rows.map((row) => row.id));
  }
  return known;
});
