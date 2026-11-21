import { Context, Duration, Effect, Layer, Predicate, Schedule, Schema } from "effect";

import { UpstreamError } from "~/api";

/**
 * Typed wrapper around the Spotify Web API and accounts service.
 *
 * Every external call goes through here, so Spotify failures become declared
 * `UpstreamError`s (carrying the upstream status) rather than raw exceptions.
 */

export const SpotifyToken = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.String,
  expires_in: Schema.Finite,
  refresh_token: Schema.optional(Schema.String),
  scope: Schema.String,
});

export type SpotifyToken = typeof SpotifyToken.Type;

export const SpotifyProfile = Schema.Struct({
  id: Schema.String,
  display_name: Schema.NullOr(Schema.String),
  // Spotify returns `null` for an account with no email, so this cannot be a
  // plain optional string: `Schema.optional` only accepts absent or undefined.
  email: Schema.optional(Schema.NullOr(Schema.String)),
  uri: Schema.String,
  external_urls: Schema.Struct({ spotify: Schema.String }),
  followers: Schema.Struct({ total: Schema.Finite }),
  images: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({ url: Schema.String })))),
});

export type SpotifyProfile = typeof SpotifyProfile.Type;

const SpotifyTrack = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  name: Schema.String,
  duration_ms: Schema.Finite,
  uri: Schema.String,
  external_urls: Schema.optional(Schema.Struct({ spotify: Schema.String })),
  album: Schema.optional(
    Schema.Struct({
      name: Schema.optional(Schema.String),
      images: Schema.optional(Schema.Array(Schema.Struct({ url: Schema.String }))),
    }),
  ),
  artists: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String }))),
});

const PlayHistory = Schema.Struct({
  played_at: Schema.String,
  // Spotify omits the context for some playback sources, so this cannot be a
  // required nullable field.
  context: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        type: Schema.optional(Schema.String),
        uri: Schema.optional(Schema.String),
      }),
    ),
  ),
  track: SpotifyTrack,
});

export type PlayHistory = typeof PlayHistory.Type;

const RecentlyPlayed = Schema.Struct({ items: Schema.Array(PlayHistory) });

export class SpotifyUnauthorized extends Schema.TaggedError<SpotifyUnauthorized, { readonly brand: unique symbol }>()(
  "SpotifyUnauthorized",
  { message: Schema.String },
) {}

/**
 * The token endpoint refused the authorization itself: the code or the stored
 * refresh token is no longer accepted. Kept distinct from a failed API call
 * because only this can be fixed by sending the user through sign-in again,
 * and because the body names the reason (`invalid_grant` when a refresh token
 * has expired, `invalid_client` when the app's credentials are wrong).
 */
export class SpotifyAuthRejected extends Schema.TaggedError<SpotifyAuthRejected, { readonly brand: unique symbol }>()(
  "SpotifyAuthRejected",
  { message: Schema.String, status: Schema.Finite },
) {}

/** The app credentials the Spotify token endpoint authenticates with. */
export interface SpotifyCredentialsValue {
  readonly clientId: string;
  readonly clientSecret: string;
}

export class SpotifyCredentials extends Context.Service<
  SpotifyCredentials,
  SpotifyCredentialsValue
>()("spotistats/SpotifyCredentials") {}

const basicAuth = (credentials: SpotifyCredentialsValue) =>
  btoa(`${credentials.clientId}:${credentials.clientSecret}`);

const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  body: Schema.Json,
): Effect.Effect<S["Type"], UpstreamError> =>
  // The value is network JSON, so the static type carries nothing about the
  // generic schema's Encoded type; the unknown decoder is the honest one here.
  // oxlint-disable-next-line effecttsgo/prefer-typed-schema-decoder -- input is dynamic JSON, not the schema's Encoded type
  Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError(
      (error) =>
        new UpstreamError({
          service: "spotify",
          message: `Unexpected Spotify response: ${error.message}`,
          status: null,
        }),
    ),
  );

const readText = (
  response: Response,
  operation: string,
): Effect.Effect<string, UpstreamError> =>
  Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) =>
      new UpstreamError({
        service: "spotify",
        message: `${operation}: ${String(cause)}`,
        status: response.status,
      }),
  });

/**
 * The parsed JSON body.
 *
 * SAFETY: `Response.json()` resolves with `JSON.parse`'s output, which is JSON
 * by construction; a malformed body rejects instead of resolving.
 */
const jsonBody = (response: Response): Promise<Schema.Json> =>
  response.json<Schema.Json>();

const readJson = (
  response: Response,
  operation: string,
): Effect.Effect<Schema.Json, UpstreamError> =>
  Effect.tryPromise({
    try: () => jsonBody(response),
    catch: (cause) =>
      new UpstreamError({
        service: "spotify",
        message: `${operation}: ${String(cause)}`,
        status: response.status,
      }),
  });

const tokenRequestOnce = (
  credentials: SpotifyCredentialsValue,
  body: URLSearchParams,
) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth(credentials)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        }),
      catch: (cause) =>
        new UpstreamError({
          service: "spotify",
          message: `Spotify token request failed: ${String(cause)}`,
          status: null,
        }),
    });

    if (!response.ok) {
      const detail = yield* readText(response, "Failed to read Spotify token error");
      const message = `Spotify token request failed: ${detail}`;

      if (response.status === 429) {
        return yield* rateLimitError(message, response.headers.get("Retry-After"));
      }

      // An outage is not the user's authorization being rejected. Reporting it
      // as `SpotifyAuthRejected` would disable the account and demand a
      // reconnect that cannot fix it.
      if (response.status >= 500) {
        return yield* new UpstreamError({
          service: "spotify",
          message,
          status: response.status,
        });
      }

      return yield* new SpotifyAuthRejected({
        message,
        status: response.status,
      });
    }

    const json = yield* readJson(response, "Failed to read Spotify token response");

    return yield* decode(SpotifyToken, json);
  });

/**
 * A short `Retry-After` is Spotify telling us exactly how long to wait. A long
 * one belongs in a queue, not in an OAuth callback the browser is waiting on,
 * so those still fail fast.
 */
const maxRetryAfterMs = 2000;

/** Reads Spotify's `Retry-After` header as milliseconds, when it gives one. */
const retryAfterMs = (header: string | null): number | undefined => {
  if (header === null) return undefined;

  const seconds = Number(header);

  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
};

/** The typed failure for a rate limit, carrying the delay Spotify asked for. */
const rateLimitError = (message: string, header: string | null): UpstreamError => {
  const wait = retryAfterMs(header);

  return wait === undefined
    ? new UpstreamError({ service: "spotify", message, status: 429 })
    : new UpstreamError({ service: "spotify", message, status: 429, retryAfterMs: wait });
};

type RetryableSpotifyError = UpstreamError | SpotifyUnauthorized | SpotifyAuthRejected;

/**
 * An outage or a short rate limit is transient; a rejected request and a long
 * rate limit are final for this attempt. The browser retries the same statuses
 * for its own Spotify calls, so the worker needs the same patience so a blip
 * does not fail the page or file an issue for an outage the app cannot fix.
 */
const retryableSpotifyError = (error: RetryableSpotifyError): boolean => {
  if (!Predicate.isTagged(error, "UpstreamError")) return false;

  if (error.status === 429) {
    return error.retryAfterMs !== undefined && error.retryAfterMs <= maxRetryAfterMs;
  }

  return error.status !== null && error.status >= 500 && error.status <= 599;
};

/** Waits the header's delay when Spotify gives one, otherwise backs off. */
const spotifyRetrySchedule = Schedule.exponential("250 millis").pipe(
  Schedule.setInputType<RetryableSpotifyError>(),
  Schedule.modifyDelay(({ duration, input }) => {
    const wait =
      Predicate.isTagged(input, "UpstreamError") && input.status === 429
        ? input.retryAfterMs
        : undefined;

    return Effect.succeed(wait === undefined ? duration : Duration.millis(wait));
  }),
);

const retrySpotify = <A, E extends RetryableSpotifyError, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.retry(effect, {
    schedule: spotifyRetrySchedule,
    times: 2,
    while: retryableSpotifyError,
  });

/** Token requests share the retry policy so a rate limit cannot fail a login. */
const tokenRequest = (
  credentials: SpotifyCredentialsValue,
  body: URLSearchParams,
) => retrySpotify(tokenRequestOnce(credentials, body));

const apiRequest = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  url: string,
  accessToken: string,
): Effect.Effect<S["Type"], UpstreamError | SpotifyUnauthorized> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      catch: (cause) =>
        new UpstreamError({
          service: "spotify",
          message: `Spotify request failed: ${String(cause)}`,
          status: null,
        }),
    });

    if (response.status === 401) {
      return yield* new SpotifyUnauthorized({ message: "Spotify rejected the access token" });
    }

    if (response.status === 429) {
      const header = response.headers.get("Retry-After");
      const wait = retryAfterMs(header);

      return yield* rateLimitError(
        `Spotify rate limited the request (retry after ${wait === undefined ? "unknown" : wait / 1000}s)`,
        header,
      );
    }

    if (!response.ok) {
      const detail = yield* readText(response, "Failed to read Spotify API error");

      return yield* new UpstreamError({
        service: "spotify",
        message: `Spotify API failed: ${response.status} ${detail}`,
        status: response.status,
      });
    }

    const json = yield* readJson(response, "Failed to read Spotify API response");

    return yield* decode(schema, json);
  }).pipe(retrySpotify);

const make = Effect.gen(function* () {
  const credentials = yield* SpotifyCredentials;

  return {
    exchangeCode: (code: string, redirectUri: string) =>
      tokenRequest(
        credentials,
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      ),
    refreshToken: (refreshToken: string) =>
      tokenRequest(
        credentials,
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      ),
    profile: (accessToken: string) =>
      apiRequest(SpotifyProfile, "https://api.spotify.com/v1/me", accessToken),
    recentlyPlayed: (accessToken: string, after?: number) => {
      const url = new URL("https://api.spotify.com/v1/me/player/recently-played");
      url.searchParams.set("limit", "50");

      if (after !== undefined) url.searchParams.set("after", String(after));

      return apiRequest(RecentlyPlayed, url.toString(), accessToken).pipe(
        Effect.map((data) => data.items),
      );
    },
  } satisfies SpotifyService;
});

export interface SpotifyService {
  readonly exchangeCode: (
    code: string,
    redirectUri: string,
  ) => Effect.Effect<SpotifyToken, UpstreamError | SpotifyAuthRejected>;
  readonly refreshToken: (
    refreshToken: string,
  ) => Effect.Effect<SpotifyToken, UpstreamError | SpotifyAuthRejected>;
  readonly profile: (
    accessToken: string,
  ) => Effect.Effect<SpotifyProfile, UpstreamError | SpotifyUnauthorized>;
  readonly recentlyPlayed: (
    accessToken: string,
    after?: number,
  ) => Effect.Effect<ReadonlyArray<PlayHistory>, UpstreamError | SpotifyUnauthorized>;
}

export class Spotify extends Context.Service<Spotify, SpotifyService>()(
  "spotistats/Spotify",
) {
  static readonly make = make;
  static readonly layer = Layer.effect(this, this.make);
}

export const SpotifyLive = (credentials: SpotifyCredentialsValue) =>
  Spotify.layer.pipe(
    Layer.provide(Layer.succeed(SpotifyCredentials, credentials)),
  );
