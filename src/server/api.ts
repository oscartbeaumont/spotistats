import { Effect } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";

import { Api } from "~/api";

import { Spotify } from "./spotify";
import { Tracking } from "./tracking";

/**
 * Resolves the Spotify user behind a bearer token. A token Spotify rejects
 * becomes a declared 401, so the client can log the user out cleanly.
 */
const currentUser = (authorization: string) =>
  Effect.gen(function* () {
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

export const AccountGroupLive = HttpApiBuilder.group(Api, "account", (handlers) =>
  handlers
    .handle("status", ({ headers }) =>
      Effect.gen(function* () {
        const profile = yield* currentUser(headers.authorization);
        const tracking = yield* Tracking;
        yield* tracking.markRead(profile.id);
        return yield* tracking.status(profile.id);
      }),
    )
    .handle("refresh", ({ headers }) =>
      Effect.gen(function* () {
        const profile = yield* currentUser(headers.authorization);
        const tracking = yield* Tracking;
        const queued = yield* tracking.enqueueRefresh(profile.id);
        return { queued } satisfies { queued: boolean };
      }),
    )
    .handle("disable", ({ headers }) =>
      Effect.gen(function* () {
        const profile = yield* currentUser(headers.authorization);
        const tracking = yield* Tracking;
        yield* tracking.disable(profile.id);
        return yield* tracking.status(profile.id);
      }),
    )
    .handle("deleteData", ({ headers }) =>
      Effect.gen(function* () {
        const profile = yield* currentUser(headers.authorization);
        const tracking = yield* Tracking;
        yield* tracking.deleteData(profile.id);
        return yield* tracking.status(profile.id);
      }),
    ),
);
