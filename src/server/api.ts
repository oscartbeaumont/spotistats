import { Effect } from "effect";
import { SqlClient } from "effect/sql/SqlClient";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";

import { Api } from "~/api";
import type { RefreshResult } from "~/api";

import { Spotify, type SpotifyProfile } from "./spotify";
import { Tracking, type TrackingService } from "./tracking";
import { readDiscoveryHistory, readKnownTracks } from "./discovery";
import { startOfWeek, weekBounds } from "~/lib/weeks";

/**
 * Resolves the Spotify user behind a bearer token. A token Spotify rejects
 * becomes a declared 401, so the client can log the user out cleanly.
 */
const resolveUser = (authorization: string | undefined) =>
  Effect.gen(function* () {
    if (!authorization) return yield* new HttpApiError.Unauthorized({});
    const spotify = yield* Spotify;

    return yield* spotify.profile(authorization.replace(/^Bearer\s+/i, ""));
  }).pipe(
    Effect.catchTags({
      SpotifyUnauthorized: () => Effect.fail(new HttpApiError.Unauthorized({})),
      UpstreamError: (error) =>
        Effect.fail(
          error.status === 401 ? new HttpApiError.Unauthorized({}) : error,
        ),
    }),
  );

/** Runs a handler with the authenticated Spotify user in scope. */
const withUser = <A, E, R>(
  headers: { readonly authorization?: string | undefined },
  handler: (user: SpotifyProfile) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const user = yield* resolveUser(headers.authorization);

    return yield* handler(user);
  });

/** Runs a handler with the authenticated Spotify user and tracking service. */
const withTracking = <A, E, R>(
  headers: { readonly authorization?: string | undefined },
  handler: (
    tracking: TrackingService,
    user: SpotifyProfile,
  ) => Effect.Effect<A, E, R>,
) =>
  withUser(headers, (user) =>
    Effect.flatMap(Tracking, (tracking) => handler(tracking, user)),
  );

/** Weekly reads are available only while the listening sync is enabled. */
const withEnabledWeekly = <A, E, R>(
  headers: { readonly authorization?: string | undefined },
  handler: (
    tracking: TrackingService,
    user: SpotifyProfile,
  ) => Effect.Effect<A, E, R>,
) =>
  withTracking(headers, (tracking, user) =>
    Effect.gen(function* () {
      const access = yield* tracking.weeklyAccess(user.id);

      if (!access.enabled) return yield* new HttpApiError.Forbidden({});

      return yield* handler(tracking, user);
    }),
  );

export const AccountGroupLive = HttpApiBuilder.group(Api, "account", (handlers) =>
  handlers
    .handle("discoveryHistory", ({ headers }) =>
      withUser(headers, (user) =>
        Effect.flatMap(SqlClient, (sql) => readDiscoveryHistory(sql, user.id)),
      ),
    )
    .handle("discoveryKnown", ({ headers, payload }) =>
      withUser(headers, (user) =>
        Effect.flatMap(SqlClient, (sql) =>
          readKnownTracks(sql, user.id, payload.ids),
        ),
      ),
    )
    .handle("status", ({ headers }) =>
      withTracking(headers, (tracking, user) =>
        Effect.andThen(tracking.markRead(user.id), tracking.status(user.id)),
      ),
    )
    .handle("weeklyAccess", ({ headers }) =>
      withTracking(headers, (tracking, user) =>
        tracking.weeklyAccess(user.id),
      ),
    )
    .handle("weeklyHistory", ({ headers, query }) =>
      withEnabledWeekly(headers, (tracking, user) =>
        Effect.gen(function* () {
          const before = query.before ?? null;
          const tzOffset = query.tzOffset ?? 0;

          if (before !== null && startOfWeek(before) !== before) {
            return yield* new HttpApiError.BadRequest({});
          }

          return yield* tracking.weeklyHistory(user.id, {
            tzOffset,
            before,
            limit: Math.max(1, Math.min(52, Math.floor(query.limit ?? 12))),
          });
        }),
      ),
    )
    .handle("weeklyInsights", ({ headers, params, query }) =>
      withEnabledWeekly(headers, (tracking, user) =>
        Effect.gen(function* () {
          const tzOffset = query.tzOffset ?? 0;
          const bounds = weekBounds(params.weekStart, tzOffset);

          if (
            bounds === null ||
            bounds.fromMs < 0 ||
            bounds.fromMs > Date.now()
          ) {
            return yield* new HttpApiError.BadRequest({});
          }

          return yield* tracking.weeklyInsights(user.id, bounds, tzOffset);
        }),
      ),
    )
    .handle("insights", ({ headers, query }) =>
      withTracking(headers, (tracking, user) =>
        tracking.insights(user.id, {
          tzOffset: query.tzOffset ?? 0,
          range: query.range ?? "all",
          fromMs: query.fromMs ?? null,
          toMs: query.toMs ?? null,
        }),
      ),
    )
    .handle("exportJson", ({ headers }) =>
      withTracking(headers, (tracking, user) => tracking.exportJson(user.id)),
    )
    .handle("exportCsv", ({ headers }) =>
      withTracking(headers, (tracking, user) => tracking.exportCsv(user.id)),
    )
    .handle("refresh", ({ headers }) =>
      withTracking(headers, (tracking, user) =>
        Effect.map(
          tracking.enqueueRefresh(user.id),
          (queued): RefreshResult => ({ queued }),
        ),
      ),
    )
    .handle("disable", ({ headers }) =>
      withTracking(headers, (tracking, user) =>
        Effect.andThen(tracking.disable(user.id), tracking.status(user.id)),
      ),
    )
    .handle("deleteData", ({ headers }) =>
      withTracking(headers, (tracking, user) =>
        Effect.andThen(tracking.deleteData(user.id), tracking.status(user.id)),
      ),
    ),
);
