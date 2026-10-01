import { env } from "cloudflare:workers";
import { Context, Effect, Layer, Schema } from "effect";

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
  expires_in: Schema.Number,
  refresh_token: Schema.optional(Schema.String),
  scope: Schema.String,
});
export type SpotifyToken = typeof SpotifyToken.Type;

export const SpotifyProfile = Schema.Struct({
  id: Schema.String,
  display_name: Schema.NullOr(Schema.String),
  email: Schema.optional(Schema.String),
  uri: Schema.String,
  external_urls: Schema.Struct({ spotify: Schema.String }),
  followers: Schema.Struct({ total: Schema.Number }),
  images: Schema.Array(Schema.Struct({ url: Schema.String })),
});
export type SpotifyProfile = typeof SpotifyProfile.Type;

const SpotifyTrack = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  name: Schema.String,
  duration_ms: Schema.Number,
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
  context: Schema.NullOr(Schema.Struct({
    type: Schema.optional(Schema.String),
    uri: Schema.optional(Schema.String),
  })),
  track: SpotifyTrack,
});
export type PlayHistory = typeof PlayHistory.Type;

const RecentlyPlayed = Schema.Struct({ items: Schema.Array(PlayHistory) });

export class SpotifyUnauthorized extends Schema.TaggedError<SpotifyUnauthorized>()(
  "SpotifyUnauthorized",
  { message: Schema.String },
) {}

const basicAuth = () =>
  btoa(`${env.VITE_SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);

const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  body: unknown,
): Effect.Effect<S["Type"], UpstreamError> =>
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

const tokenRequest = (body: URLSearchParams) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth()}`,
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
      const detail = yield* Effect.promise(() => response.text());
      return yield* Effect.fail(
        new UpstreamError({
          service: "spotify",
          message: `Spotify token request failed: ${detail}`,
          status: response.status,
        }),
      );
    }

    const json = yield* Effect.promise(() => response.json());
    return yield* decode(SpotifyToken, json);
  });

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
      return yield* Effect.fail(
        new SpotifyUnauthorized({ message: "Spotify rejected the access token" }),
      );
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "60");
      return yield* Effect.fail(
        new UpstreamError({
          service: "spotify",
          message: `Spotify rate limited the request (retry after ${retryAfter}s)`,
          status: 429,
        }),
      );
    }

    if (!response.ok) {
      const detail = yield* Effect.promise(() => response.text());
      return yield* Effect.fail(
        new UpstreamError({
          service: "spotify",
          message: `Spotify API failed: ${response.status} ${detail}`,
          status: response.status,
        }),
      );
    }

    const json = yield* Effect.promise(() => response.json());
    return yield* decode(schema, json);
  });

const make = Effect.gen(function* () {
  return {
    exchangeCode: (code: string, redirectUri: string) =>
      tokenRequest(
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      ),
    refreshToken: (refreshToken: string) =>
      tokenRequest(
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
  } satisfies SpotifyShape;
});

export interface SpotifyShape {
  readonly exchangeCode: (
    code: string,
    redirectUri: string,
  ) => Effect.Effect<SpotifyToken, UpstreamError>;
  readonly refreshToken: (
    refreshToken: string,
  ) => Effect.Effect<SpotifyToken, UpstreamError>;
  readonly profile: (
    accessToken: string,
  ) => Effect.Effect<SpotifyProfile, UpstreamError | SpotifyUnauthorized>;
  readonly recentlyPlayed: (
    accessToken: string,
    after?: number,
  ) => Effect.Effect<ReadonlyArray<PlayHistory>, UpstreamError | SpotifyUnauthorized>;
}

export class Spotify extends Context.Service<Spotify, SpotifyShape>()(
  "spotistats/Spotify",
) {}

export const SpotifyLive = Layer.effect(Spotify, make);
