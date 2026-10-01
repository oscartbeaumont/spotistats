import { env } from "cloudflare:workers";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

import { type TrackingStatus, UpstreamError } from "~/api";

import { Spotify, SpotifyUnauthorized, type SpotifyProfile, type SpotifyToken } from "./spotify";

/**
 * All persistence and sync logic for listening stats.
 *
 * The service owns the D1 database and the sync queue. It maps every driver
 * failure to a declared `UpstreamError`, so the HTTP layer never leaks an
 * unknown exception to the client.
 */

const databaseError = (message: string) => (cause: { readonly message: string }) =>
  new UpstreamError({ service: "database", message: `${message}: ${cause.message}`, status: null });

const queueError = (message: string) => (cause: unknown) =>
  new UpstreamError({ service: "queue", message: `${message}: ${String(cause)}`, status: null });

const listenId = (spotifyUserId: string, trackId: string, playedAtMs: number) =>
  `${spotifyUserId}:${trackId}:${playedAtMs}`;

interface StatusRow {
  enabled: number;
  consentedAt: number;
  lastReadAt: number;
  disabledAt: number | null;
  lastPlayedAtMs: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
}

interface RecentRow {
  playedAt: string;
  playedAtMs: number;
  name: string;
  albumName: string | null;
  artistNames: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
}

interface CountRow {
  count: number;
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient;
  const spotify = yield* Spotify;

  const status = (spotifyUserId: string) =>
    Effect.gen(function* () {
      const rows = yield* sql<StatusRow>`
        SELECT
          u.enabled AS enabled,
          u.consented_at AS consentedAt,
          u.last_read_at AS lastReadAt,
          u.disabled_at AS disabledAt,
          s.last_played_at_ms AS lastPlayedAtMs,
          s.last_success_at AS lastSuccessAt,
          s.last_error AS lastError
        FROM spotify_tracking_users u
        LEFT JOIN spotify_sync_state s ON s.spotify_user_id = u.spotify_user_id
        WHERE u.spotify_user_id = ${spotifyUserId}
        LIMIT 1
      `.pipe(Effect.mapError(databaseError("Failed to read tracking status")));

      const recent = yield* sql<RecentRow>`
        SELECT
          l.played_at AS playedAt,
          l.played_at_ms AS playedAtMs,
          t.name AS name,
          t.album_name AS albumName,
          t.artist_names AS artistNames,
          t.image_url AS imageUrl,
          t.external_url AS externalUrl
        FROM spotify_listens l
        INNER JOIN spotify_tracks t ON t.spotify_track_id = l.spotify_track_id
        WHERE l.spotify_user_id = ${spotifyUserId}
        ORDER BY l.played_at_ms DESC
        LIMIT 5
      `.pipe(Effect.mapError(databaseError("Failed to read recent listens")));

      const [counted] = yield* sql<CountRow>`
        SELECT COUNT(*) AS count FROM spotify_listens WHERE spotify_user_id = ${spotifyUserId}
      `.pipe(Effect.mapError(databaseError("Failed to count listens")));

      const row = rows[0];
      return {
        enabled: !!row?.enabled,
        consentedAt: row?.consentedAt ?? null,
        lastReadAt: row?.lastReadAt ?? null,
        disabledAt: row?.disabledAt ?? null,
        lastPlayedAtMs: row?.lastPlayedAtMs ?? null,
        lastSuccessAt: row?.lastSuccessAt ?? null,
        lastError: row?.lastError ?? null,
        listenCount: counted?.count ?? 0,
        recent,
      } satisfies TrackingStatus;
    });

  const enable = (profile: SpotifyProfile, token: SpotifyToken) =>
    Effect.gen(function* () {
      if (!token.refresh_token) {
        return yield* Effect.fail(
          new UpstreamError({
            service: "spotify",
            message: "Spotify did not return a refresh token",
            status: null,
          }),
        );
      }
      const now = Date.now();
      yield* sql`
        INSERT INTO spotify_tracking_users
          (spotify_user_id, display_name, email, enabled, consented_at, last_read_at, disabled_at, created_at, updated_at)
        VALUES (${profile.id}, ${profile.display_name}, ${profile.email ?? null}, 1, ${now}, ${now}, NULL, ${now}, ${now})
        ON CONFLICT(spotify_user_id) DO UPDATE SET
          display_name = excluded.display_name,
          email = excluded.email,
          enabled = 1,
          consented_at = excluded.consented_at,
          last_read_at = excluded.last_read_at,
          disabled_at = NULL,
          updated_at = excluded.updated_at
      `.pipe(Effect.mapError(databaseError("Failed to enable tracking")));

      yield* sql`
        INSERT INTO spotify_tokens (spotify_user_id, refresh_token, scope, updated_at)
        VALUES (${profile.id}, ${token.refresh_token}, ${token.scope}, ${now})
        ON CONFLICT(spotify_user_id) DO UPDATE SET
          refresh_token = excluded.refresh_token,
          scope = excluded.scope,
          updated_at = excluded.updated_at
      `.pipe(Effect.mapError(databaseError("Failed to store Spotify token")));

      yield* sql`
        INSERT INTO spotify_sync_state (spotify_user_id, last_played_at_ms, last_success_at, last_error, next_sync_after, updated_at)
        VALUES (${profile.id}, NULL, NULL, NULL, 0, ${now})
        ON CONFLICT(spotify_user_id) DO UPDATE SET
          last_error = NULL,
          next_sync_after = 0,
          updated_at = excluded.updated_at
      `.pipe(Effect.mapError(databaseError("Failed to reset sync state")));

      // A failed enqueue is not fatal: the cron trigger will pick the user up.
      yield* Effect.tryPromise({
        try: () => env.SPOTIFY_SYNC_QUEUE.send({ spotifyUserId: profile.id }),
        catch: queueError("Failed to enqueue sync"),
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() =>
            console.error("Failed to enqueue the initial sync", cause),
          ),
        ),
      );
    });

  const disable = (spotifyUserId: string) =>
    Effect.gen(function* () {
      const now = Date.now();
      yield* sql`
        UPDATE spotify_tracking_users
        SET enabled = 0, disabled_at = ${now}, updated_at = ${now}
        WHERE spotify_user_id = ${spotifyUserId}
      `.pipe(Effect.mapError(databaseError("Failed to disable tracking")));
    });

  const disableInactive = Effect.gen(function* () {
    const now = Date.now();
    const cutoff = now - 1000 * 60 * 60 * 24 * 183;
    yield* sql`
      UPDATE spotify_tracking_users
      SET enabled = 0, disabled_at = ${now}, updated_at = ${now}
      WHERE enabled = 1 AND last_read_at < ${cutoff}
    `.pipe(Effect.mapError(databaseError("Failed to disable inactive users")));
  });

  const markRead = (spotifyUserId: string) =>
    sql`
      UPDATE spotify_tracking_users
      SET last_read_at = ${Date.now()}, updated_at = ${Date.now()}
      WHERE spotify_user_id = ${spotifyUserId}
    `.pipe(
      Effect.asVoid,
      Effect.mapError(databaseError("Failed to mark stats read")),
    );

  const deleteData = (spotifyUserId: string) =>
    sql`
      DELETE FROM spotify_tracking_users WHERE spotify_user_id = ${spotifyUserId}
    `.pipe(
      Effect.asVoid,
      Effect.mapError(databaseError("Failed to delete account data")),
    );

  const recordSyncFailure = (
    spotifyUserId: string,
    message: string,
    retryAfterSeconds: number | null,
  ) =>
    Effect.gen(function* () {
      const now = Date.now();
      yield* sql`
        UPDATE spotify_sync_state
        SET last_error = ${message}, next_sync_after = ${now + (retryAfterSeconds ?? 15 * 60) * 1000}, updated_at = ${now}
        WHERE spotify_user_id = ${spotifyUserId}
      `.pipe(Effect.mapError(databaseError("Failed to record sync failure")));
    });

  /**
   * Stops syncing and marks the account as needing a new Spotify login. Used
   * for permanent Spotify failures, such as a rejected or expired refresh
   * token, where retrying can never succeed. Disabling the account makes the
   * account page show the reconnect button again.
   */
  const requireReauth = (spotifyUserId: string, message: string) =>
    Effect.gen(function* () {
      const now = Date.now();
      yield* sql`
        UPDATE spotify_tracking_users
        SET enabled = 0, disabled_at = ${now}, updated_at = ${now}
        WHERE spotify_user_id = ${spotifyUserId}
      `.pipe(Effect.mapError(databaseError("Failed to disable tracking")));
      yield* sql`
        UPDATE spotify_sync_state
        SET last_error = ${message}, next_sync_after = ${now + 15 * 60 * 1000}, updated_at = ${now}
        WHERE spotify_user_id = ${spotifyUserId}
      `.pipe(Effect.mapError(databaseError("Failed to record the reauthentication requirement")));
    });

  const enqueueRefresh = (spotifyUserId: string) =>
    Effect.gen(function* () {
      const rows = yield* sql<{ enabled: number }>`
        SELECT enabled FROM spotify_tracking_users WHERE spotify_user_id = ${spotifyUserId}
      `.pipe(Effect.mapError(databaseError("Failed to check tracking status")));
      if (!rows[0]?.enabled) return false;
      yield* Effect.tryPromise({
        try: () => env.SPOTIFY_SYNC_QUEUE.send({ spotifyUserId }),
        catch: queueError("Failed to enqueue sync"),
      });
      return true;
    });

  const enqueueDue = (limit = 100) =>
    Effect.gen(function* () {
      const now = Date.now();
      const rows = yield* sql<{ spotifyUserId: string }>`
        SELECT u.spotify_user_id AS spotifyUserId
        FROM spotify_tracking_users u
        INNER JOIN spotify_sync_state s ON s.spotify_user_id = u.spotify_user_id
        WHERE u.enabled = 1 AND s.next_sync_after <= ${now}
        ORDER BY s.next_sync_after
        LIMIT ${limit}
      `.pipe(Effect.mapError(databaseError("Failed to find due users")));
      if (rows.length === 0) return 0;
      yield* Effect.tryPromise({
        try: () =>
          env.SPOTIFY_SYNC_QUEUE.sendBatch(
            rows.map((row) => ({ body: { spotifyUserId: row.spotifyUserId } })),
          ),
        catch: queueError("Failed to enqueue due syncs"),
      });
      return rows.length;
    });

  const refreshAccessToken = (spotifyUserId: string) =>
    Effect.gen(function* () {
      const rows = yield* sql<{ refreshToken: string }>`
        SELECT refresh_token AS refreshToken FROM spotify_tokens WHERE spotify_user_id = ${spotifyUserId}
      `.pipe(Effect.mapError(databaseError("Failed to read refresh token")));
      const row = rows[0];
      if (!row) {
        return yield* Effect.fail(
          new UpstreamError({
            service: "database",
            message: `No refresh token for ${spotifyUserId}`,
            status: null,
          }),
        );
      }
      const token = yield* spotify.refreshToken(row.refreshToken);
      if (token.refresh_token) {
        yield* sql`
          UPDATE spotify_tokens
          SET refresh_token = ${token.refresh_token}, scope = ${token.scope}, updated_at = ${Date.now()}
          WHERE spotify_user_id = ${spotifyUserId}
        `.pipe(Effect.mapError(databaseError("Failed to persist refreshed token")));
      }
      return token.access_token;
    });

  const sync = (spotifyUserId: string) =>
    Effect.gen(function* () {
      const users = yield* sql<{ enabled: number }>`
        SELECT enabled FROM spotify_tracking_users WHERE spotify_user_id = ${spotifyUserId}
      `.pipe(Effect.mapError(databaseError("Failed to check tracking status")));
      if (!users[0]?.enabled) return;

      const state = yield* sql<{ lastPlayedAtMs: number | null }>`
        SELECT last_played_at_ms AS lastPlayedAtMs FROM spotify_sync_state WHERE spotify_user_id = ${spotifyUserId}
      `.pipe(Effect.mapError(databaseError("Failed to read sync state")));

      const accessToken = yield* refreshAccessToken(spotifyUserId);
      const items = yield* spotify.recentlyPlayed(
        accessToken,
        state[0]?.lastPlayedAtMs ?? undefined,
      );

      const now = Date.now();
      let newest = state[0]?.lastPlayedAtMs ?? null;
      let oldest: number | null = null;

      for (const item of items) {
        if (!item.track.id) continue;
        const playedAtMs = Date.parse(item.played_at);
        if (!Number.isFinite(playedAtMs)) continue;
        newest = Math.max(newest ?? 0, playedAtMs);
        oldest = oldest === null ? playedAtMs : Math.min(oldest, playedAtMs);
        const image = item.track.album?.images?.[0]?.url ?? null;
        const artists = item.track.artists?.map((artist) => artist.name).join(", ") ?? "";
        const raw = JSON.stringify(item.track);

        yield* sql`
          INSERT INTO spotify_tracks
            (spotify_track_id, name, album_name, artist_names, duration_ms, uri, external_url, image_url, raw_json, updated_at)
          VALUES (
            ${item.track.id}, ${item.track.name}, ${item.track.album?.name ?? null}, ${artists},
            ${item.track.duration_ms}, ${item.track.uri}, ${item.track.external_urls?.spotify ?? null},
            ${image}, ${raw}, ${now}
          )
          ON CONFLICT(spotify_track_id) DO UPDATE SET
            name = excluded.name,
            album_name = excluded.album_name,
            artist_names = excluded.artist_names,
            duration_ms = excluded.duration_ms,
            uri = excluded.uri,
            external_url = excluded.external_url,
            image_url = excluded.image_url,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
        `.pipe(Effect.mapError(databaseError("Failed to upsert track")));

        yield* sql`
          INSERT INTO spotify_listens
            (id, spotify_user_id, spotify_track_id, played_at, played_at_ms, context_type, context_uri, raw_json, created_at)
          VALUES (
            ${listenId(spotifyUserId, item.track.id, playedAtMs)}, ${spotifyUserId}, ${item.track.id},
            ${item.played_at}, ${playedAtMs}, ${item.context?.type ?? null}, ${item.context?.uri ?? null},
            ${JSON.stringify(item)}, ${now}
          )
          ON CONFLICT DO NOTHING
        `.pipe(Effect.mapError(databaseError("Failed to insert listen")));
      }

      // Spotify returns at most 50 plays, and only the recent window. If the
      // page is full, more plays may have happened than the window can return,
      // so advance only to the oldest fetched play: the next sync re-reads this
      // window instead of skipping plays Spotify has already evicted.
      const watermark =
        items.length >= 50 && oldest !== null
          ? oldest
          : (newest ?? state[0]?.lastPlayedAtMs ?? null);

      yield* sql`
        UPDATE spotify_sync_state
        SET
          last_played_at_ms = ${watermark},
          last_success_at = ${now},
          last_error = NULL,
          next_sync_after = ${now + 15 * 60 * 1000},
          updated_at = ${now}
        WHERE spotify_user_id = ${spotifyUserId}
      `.pipe(Effect.mapError(databaseError("Failed to update sync state")));
    });

  return {
    status,
    enable,
    disable,
    disableInactive,
    markRead,
    deleteData,
    recordSyncFailure,
    requireReauth,
    enqueueRefresh,
    enqueueDue,
    sync,
  } satisfies TrackingShape;
});

export interface TrackingShape {
  readonly status: (spotifyUserId: string) => Effect.Effect<TrackingStatus, UpstreamError>;
  readonly enable: (
    profile: SpotifyProfile,
    token: SpotifyToken,
  ) => Effect.Effect<void, UpstreamError>;
  readonly disable: (spotifyUserId: string) => Effect.Effect<void, UpstreamError>;
  readonly disableInactive: Effect.Effect<void, UpstreamError>;
  readonly markRead: (spotifyUserId: string) => Effect.Effect<void, UpstreamError>;
  readonly deleteData: (spotifyUserId: string) => Effect.Effect<void, UpstreamError>;
  readonly recordSyncFailure: (
    spotifyUserId: string,
    message: string,
    retryAfterSeconds: number | null,
  ) => Effect.Effect<void, UpstreamError>;
  readonly requireReauth: (
    spotifyUserId: string,
    message: string,
  ) => Effect.Effect<void, UpstreamError>;
  readonly enqueueRefresh: (spotifyUserId: string) => Effect.Effect<boolean, UpstreamError>;
  readonly enqueueDue: (limit?: number) => Effect.Effect<number, UpstreamError>;
  readonly sync: (
    spotifyUserId: string,
  ) => Effect.Effect<void, UpstreamError | SpotifyUnauthorized>;
}

export class Tracking extends Context.Service<Tracking, TrackingShape>()(
  "spotistats/Tracking",
) {}

export const TrackingLive = Layer.effect(Tracking, make);
