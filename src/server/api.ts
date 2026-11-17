import { Effect } from "effect";
import { SqlClient } from "effect/sql/SqlClient";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";

import { Api } from "~/api";
import type { RefreshResult } from "~/api";

import { Spotify, type SpotifyProfile } from "./spotify";
import { Tracking, type TrackingService } from "./tracking";
import { readDiscoveryHistory, readKnownTracks } from "./discovery";

/**
 * Resolves the Spotify user behind a bearer token. A token Spotify rejects
 * becomes a declared 401, so the client can log the user out cleanly.
 */
const resolveUser = (authorization: string | undefined) =>
  Effect.gen(function* () {
    if (!authorization) return yield* Effect.fail(new HttpApiError.Unauthorized({}));
    const spotify = yield* Spotify;

    return yield* spotify.profile(authorization.replace(/^Bearer\s+/i, ""));
  }).pipe(
    Effect.catchTag("SpotifyUnauthorized", () =>
      Effect.fail(new HttpApiError.Unauthorized({})),
    ),
    Effect.catchTag("UpstreamError", (error) =>
      Effect.fail(
        error.status === 401 ? new HttpApiError.Unauthorized({}) : error,
      ),
    ),
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
