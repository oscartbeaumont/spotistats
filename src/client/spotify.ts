import { Effect, Schedule, Schema } from "effect";
import { untrack } from "solid-js";

import { authStore, setAuthStore } from "./storage";

/**
 * Browser-side typed client for the Spotify Web API.
 *
 * Every call is an `Effect`. Responses are validated with Effect Schema,
 * failures are declared tagged errors, and transient failures retry with a
 * backoff schedule. `runSpotify` turns an effect into the promise the UI
 * boundary awaits.
 */

export const spotifyClientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;

export const spotifyScopes = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  "user-read-email",
  "user-read-recently-played",
  "user-read-currently-playing",
];

export class SpotifyUnauthenticatedError extends Schema.TaggedError<SpotifyUnauthenticatedError>()(
  "SpotifyUnauthenticatedError",
  { message: Schema.String },
) {
  constructor() {
    super({ message: "Spotistats: 401 Unauthorized" });
  }
}

export class SpotifyApiError extends Schema.TaggedError<SpotifyApiError>()(
  "SpotifyApiError",
  { status: Schema.Number, body: Schema.Unknown, message: Schema.String },
) {
  constructor(readonly status: number, readonly body: unknown) {
    super({ status, body, message: `Spotistats: ${status}` });
  }
}

export class SpotifyRequestError extends Schema.TaggedError<SpotifyRequestError>()(
  "SpotifyRequestError",
  { cause: Schema.Unknown, message: Schema.String },
) {
  constructor(readonly cause: unknown) {
    super({ cause, message: "Spotistats: Spotify request failed" });
  }
}

export type SpotifyError =
  | SpotifyUnauthenticatedError
  | SpotifyApiError
  | SpotifyRequestError;

const Image = Schema.Struct({ url: Schema.String });
const Named = Schema.Struct({ name: Schema.String });

export const SpotifyProfile = Schema.Struct({
  id: Schema.String,
  display_name: Schema.NullOr(Schema.String),
  email: Schema.optional(Schema.String),
  uri: Schema.String,
  external_urls: Schema.Struct({ spotify: Schema.String }),
  followers: Schema.Struct({ total: Schema.Number }),
  // Spotify returns `null` rather than an empty array for some accounts.
  images: Schema.optional(Schema.NullOr(Schema.Array(Image))),
});

export const SpotifyItem = Schema.Struct({
  name: Schema.String,
  type: Schema.optional(Schema.String),
  uri: Schema.String,
  external_urls: Schema.Struct({ spotify: Schema.String }),
  images: Schema.optional(Schema.NullOr(Schema.Array(Image))),
  artists: Schema.optional(Schema.Array(Named)),
  album: Schema.optional(
    Schema.Struct({ images: Schema.optional(Schema.NullOr(Schema.Array(Image))) }),
  ),
});
export type SpotifyItem = typeof SpotifyItem.Type;

export const CurrentlyPlaying = Schema.Struct({
  is_playing: Schema.Boolean,
  currently_playing_type: Schema.String,
  item: Schema.NullOr(SpotifyItem),
  progress_ms: Schema.NullOr(Schema.Number),
});
export type CurrentlyPlaying = typeof CurrentlyPlaying.Type;

export const Playlist = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.String,
  public: Schema.optional(Schema.NullOr(Schema.Boolean)),
  collaborative: Schema.optional(Schema.NullOr(Schema.Boolean)),
  owner: Schema.optional(
    Schema.Struct({ display_name: Schema.NullOr(Schema.String) }),
  ),
  images: Schema.optional(Schema.NullOr(Schema.Array(Image))),
});
export type Playlist = typeof Playlist.Type;

const page = <S extends Schema.Constraint>(item: S) =>
  Schema.Struct({
    items: Schema.Array(item),
    next: Schema.NullOr(Schema.String),
    total: Schema.Number,
    limit: Schema.Number,
    offset: Schema.Number,
  });

const Track = Schema.Struct({
  // Local files have no Spotify id.
  id: Schema.NullOr(Schema.String),
  is_local: Schema.Boolean,
  name: Schema.String,
  album: Schema.Struct({ name: Schema.String, release_date: Schema.String }),
  artists: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  duration_ms: Schema.Number,
  popularity: Schema.optional(Schema.NullOr(Schema.Number)),
});

export const PlaylistTrack = Schema.Struct({
  added_by: Schema.optional(Schema.Struct({ id: Schema.String })),
  added_at: Schema.String,
  track: Schema.optional(Track),
});
export type PlaylistTrack = typeof PlaylistTrack.Type;

export type SpotifyPage<T> = {
  items: readonly T[];
  next: string | null;
  total: number;
  limit: number;
  offset: number;
};

const AudioFeatures = Schema.Struct({
  danceability: Schema.Number,
  energy: Schema.Number,
  speechiness: Schema.Number,
  acousticness: Schema.Number,
  instrumentalness: Schema.Number,
  liveness: Schema.Number,
  valence: Schema.Number,
  tempo: Schema.Number,
  key: Schema.Number,
  loudness: Schema.Number,
  mode: Schema.Number,
  time_signature: Schema.Number,
});
export type AudioFeatures = typeof AudioFeatures.Type;

const Artist = Schema.Struct({
  id: Schema.String,
  genres: Schema.Array(Schema.String),
});
export type SpotifyArtist = typeof Artist.Type;

const retryable = (status: number) => [429, 500, 502, 503].includes(status);

const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
): Effect.Effect<S["Type"], SpotifyApiError> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(
      (error) =>
        new SpotifyApiError(200, {
          error: "Spotify returned an unexpected response shape",
          detail: String(error),
        }),
    ),
  );

const request = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  url: string,
): Effect.Effect<S["Type"], SpotifyError> =>
  Effect.gen(function* () {
    const store = untrack(() => authStore());
    if (store.status !== "authenticated") {
      return yield* Effect.fail(new SpotifyUnauthenticatedError());
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          cache: "no-store",
          headers: { Authorization: store.accessToken },
        }),
      catch: (cause) => new SpotifyRequestError(cause),
    });

    if (response.status === 401) {
      setAuthStore({ status: "empty" });
      return yield* Effect.fail(new SpotifyUnauthenticatedError());
    }

    if (response.status === 204) return yield* decode(schema, null);

    if (!response.ok) {
      const body = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: (cause) =>
          new SpotifyApiError(response.status, {
            status: response.status,
            detail: String(cause),
          }),
      }).pipe(Effect.catchTag("SpotifyApiError", (error) => Effect.succeed(error.body)));
      return yield* Effect.fail(new SpotifyApiError(response.status, body));
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) =>
        new SpotifyApiError(response.status, {
          error: "Spotify response body could not be read",
          detail: String(cause),
        }),
    });
    return yield* decode(schema, json);
  }).pipe(
    Effect.retry({
      schedule: Schedule.exponential("500 millis"),
      times: 2,
      while: (error) =>
        error instanceof SpotifyRequestError ||
        (error instanceof SpotifyApiError && retryable(error.status)),
    }),
  );

/** Runs a Spotify effect as the promise a Solid boundary awaits. */
export const runSpotify = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect);

export const getProfile = () =>
  request(SpotifyProfile, "https://api.spotify.com/v1/me");

export const getTopTracksPage = (range: "long" | "medium" | "short", offset = 0) =>
  request(
    page(SpotifyItem),
    `https://api.spotify.com/v1/me/top/tracks?limit=50&offset=${offset}&time_range=${range}_term`,
  );

export const getSavedAlbumsPage = (offset = 0) =>
  request(
    Schema.Struct({
      items: Schema.Array(Schema.Struct({ album: SpotifyItem })),
      next: Schema.NullOr(Schema.String),
      total: Schema.Number,
      limit: Schema.Number,
      offset: Schema.Number,
    }),
    `https://api.spotify.com/v1/me/albums?limit=50&offset=${offset}`,
  ).pipe(Effect.map((data) => ({ ...data, items: data.items.map((entry) => entry.album) })));

const playlistPage = Schema.Struct({
  items: Schema.Array(Playlist),
  next: Schema.NullOr(Schema.String),
});

export const getPlaylists = () =>
  Effect.gen(function* () {
    let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";
    const value: Playlist[] = [];
    while (url) {
      const data: { readonly items: ReadonlyArray<Playlist>; readonly next: string | null } =
        yield* request(playlistPage, url);
      value.push(...data.items);
      url = data.next;
    }
    return [{ name: "Liked Songs", public: true, images: [] }, ...value];
  });

export const getCurrentlyPlaying = () =>
  request(Schema.NullOr(CurrentlyPlaying), "https://api.spotify.com/v1/me/player/currently-playing");

export const getLikedTracksPage = (offset = 0) =>
  request(page(PlaylistTrack), `https://api.spotify.com/v1/me/tracks?limit=50&offset=${offset}`);

export const getPlaylistTracksPage = (playlistId: string, offset = 0) =>
  request(
    page(PlaylistTrack),
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&offset=${offset}`,
  );

export const getAudioFeatures = (ids: string) =>
  ids
    ? request(
        // Spotify returns `null` entries for tracks without audio features, and
        // the entries stay positionally aligned with the requested ids.
        Schema.Struct({ audio_features: Schema.Array(Schema.NullOr(AudioFeatures)) }),
        `https://api.spotify.com/v1/audio-features?ids=${ids}`,
      ).pipe(Effect.map((data) => data.audio_features))
    : Effect.succeed<ReadonlyArray<AudioFeatures | null>>([]);

export const getArtists = (ids: string) =>
  ids
    ? request(
        // Invalid ids come back as `null`; drop them so callers see only artists.
        Schema.Struct({ artists: Schema.Array(Schema.NullOr(Artist)) }),
        `https://api.spotify.com/v1/artists?ids=${ids}`,
      ).pipe(
        Effect.map((data) =>
          data.artists.filter((artist): artist is SpotifyArtist => artist !== null),
        ),
      )
    : Effect.succeed<ReadonlyArray<SpotifyArtist>>([]);
