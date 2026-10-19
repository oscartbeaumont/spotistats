import { Effect } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";

import { Api } from "~/api";

import { Spotify, type SpotifyProfile } from "./spotify";
import { Tracking } from "./tracking";

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

export const AccountGroupLive = HttpApiBuilder.group(Api, "account", (handlers) =>
  handlers
    .handle("status", ({ headers }) =>
      withUser(headers, (user) =>
        Effect.gen(function* () {
          const tracking = yield* Tracking;
          yield* tracking.markRead(user.id);
          return yield* tracking.status(user.id);
        }),
      ),
    )
    .handle("refresh", ({ headers }) =>
      withUser(headers, (user) =>
        Effect.gen(function* () {
          const tracking = yield* Tracking;
          const queued = yield* tracking.enqueueRefresh(user.id);
          return { queued } satisfies { queued: boolean };
        }),
      ),
    )
    .handle("disable", ({ headers }) =>
      withUser(headers, (user) =>
        Effect.gen(function* () {
          const tracking = yield* Tracking;
          yield* tracking.disable(user.id);
          return yield* tracking.status(user.id);
        }),
      ),
    )
    .handle("deleteData", ({ headers }) =>
      withUser(headers, (user) =>
        Effect.gen(function* () {
          const tracking = yield* Tracking;
          yield* tracking.deleteData(user.id);
          return yield* tracking.status(user.id);
        }),
      ),
    ),
);
