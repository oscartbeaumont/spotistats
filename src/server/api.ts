import { Effect } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";

import { Api } from "~/api";

import { Spotify, type SpotifyProfile } from "./spotify";
import { Tracking } from "./tracking";

/**
 * The account routes are polled — status every few seconds while a sync is
 * queued — and each request used to spend a Spotify call purely to learn who
 * the bearer token belongs to. That is the rate-limit path the old code kept
 * walking into. The answer only changes when the token does, so it is cached
 * briefly per isolate. A rejected token is never cached, so logging out still
 * takes effect immediately.
 */
const profileCacheTtlMs = 5 * 60 * 1000;
const profileCacheLimit = 256;
const profileCache = new Map<
  string,
  { profile: SpotifyProfile; expiresAt: number }
>();

const readCachedProfile = (accessToken: string) => {
  const entry = profileCache.get(accessToken);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    profileCache.delete(accessToken);
    return undefined;
  }
  return entry.profile;
};

const cacheProfile = (accessToken: string, profile: SpotifyProfile) => {
  if (profileCache.size >= profileCacheLimit) {
    const oldest = profileCache.keys().next().value;
    if (oldest !== undefined) profileCache.delete(oldest);
  }
  profileCache.set(accessToken, {
    profile,
    expiresAt: Date.now() + profileCacheTtlMs,
  });
};

/**
 * Resolves the Spotify user behind a bearer token. A token Spotify rejects
 * becomes a declared 401, so the client can log the user out cleanly.
 */
const resolveUser = (authorization: string | undefined) =>
  Effect.gen(function* () {
    if (!authorization) return yield* Effect.fail(new HttpApiError.Unauthorized({}));
    const accessToken = authorization.replace(/^Bearer\s+/i, "");

    const cached = readCachedProfile(accessToken);
    if (cached) return cached;

    const spotify = yield* Spotify;
    const profile = yield* spotify.profile(accessToken);
    cacheProfile(accessToken, profile);
    return profile;
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
