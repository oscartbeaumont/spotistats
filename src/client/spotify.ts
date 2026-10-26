import { Effect, Option, Schedule, Schema } from "effect";
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

/**
 * A successful response whose body the app cannot use.
 *
 * This is not an HTTP failure, so it must not reuse `SpotifyApiError` and its
 * status: a decode failure used to travel as `SpotifyApiError(200)`, which read
 * as "Spotify answered 200" in error tracking and named no endpoint.
 */
export class SpotifyResponseError extends Schema.TaggedError<SpotifyResponseError>()(
  "SpotifyResponseError",
  { endpoint: Schema.String, detail: Schema.String, message: Schema.String },
) {
  constructor(readonly endpoint: string, readonly detail: string) {
    super({
      endpoint,
      detail,
      message: `Spotistats: unexpected response from ${endpoint}`,
    });
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
  | SpotifyResponseError
  | SpotifyRequestError;

const Image = Schema.Struct({ url: Schema.String });
const Named = Schema.Struct({ name: Schema.String });

export const SpotifyProfile = Schema.Struct({
  id: Schema.String,
  display_name: Schema.NullOr(Schema.String),
  // Spotify returns `null` for an account with no email, so this cannot be a
  // plain optional string: `Schema.optional` only accepts absent or undefined.
  email: Schema.optional(Schema.NullOr(Schema.String)),
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
  artists: Schema.Array(Schema.Struct({ id: Schema.NullOr(Schema.String), name: Schema.String })),
  duration_ms: Schema.Number,
  popularity: Schema.optional(Schema.NullOr(Schema.Number)),
});

export const PlaylistTrack = Schema.Struct({
  added_by: Schema.optional(Schema.NullOr(Schema.Struct({ id: Schema.String }))),
  added_at: Schema.NullOr(Schema.String),
  track: Schema.optional(Schema.NullOr(Track)),
});
export type PlaylistTrack = typeof PlaylistTrack.Type;

export type SpotifyPage<T> = {
  items: readonly T[];
  next: string | null;
  total: number;
  limit: number;
  offset: number;
};

/**
 * A page the favourites list can append, with where the next page starts.
 *
 * `nextOffset` is Spotify's item numbering, not the number of rows kept. When
 * an entry is skipped, counting the kept rows would re-request it on the next
 * page and shift every later offset.
 */
export type SpotifyListing<T> = {
  items: readonly T[];
  next: string | null;
  nextOffset: number;
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

/**
 * The Spotify endpoint a URL hits, with ids masked.
 *
 * It labels a shape failure without leaking a track, album or playlist id into
 * the message or into error grouping.
 */
const endpointOf = (url: string): string => {
  try {
    return new URL(url, "https://api.spotify.com").pathname.replace(
      /\/[0-9A-Za-z]{22}(?=\/|$)/g,
      "/:id",
    );
  } catch {
    return "Spotify";
  }
};

const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
  url: string,
): Effect.Effect<S["Type"], SpotifyResponseError> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(
      (error) => new SpotifyResponseError(endpointOf(url), String(error)),
    ),
  );

const request = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  url: string,
  options?: { method: "POST" | "PUT"; body: unknown },
): Effect.Effect<S["Type"], SpotifyError> =>
  Effect.gen(function* () {
    const store = untrack(() => authStore());
    if (store.status !== "authenticated") {
      return yield* Effect.fail(new SpotifyUnauthenticatedError());
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: options?.method,
          body: options ? JSON.stringify(options.body) : undefined,
          cache: "no-store",
          headers: { Authorization: store.accessToken, ...(options ? { "Content-Type": "application/json" } : {}) },
        }),
      catch: (cause) => new SpotifyRequestError(cause),
    });

    if (response.status === 401) {
      // An in-flight request can outlive logout/login. Only clear the session
      // that supplied this request's rejected token, not a newer session.
      setAuthStore((current) =>
        current.status === "authenticated" && current.accessToken === store.accessToken
          ? { status: "empty" }
          : current,
      );
      return yield* Effect.fail(new SpotifyUnauthenticatedError());
    }

    if (response.status === 204) return yield* decode(schema, null, url);

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
    return yield* decode(schema, json, url);
  }).pipe(
    Effect.retry({
      schedule: Schedule.exponential("500 millis"),
      times: 2,
      while: (error) =>
        !options && (error instanceof SpotifyRequestError ||
        (error instanceof SpotifyApiError && retryable(error.status))),
    }),
  );

/** Runs a Spotify effect as the promise a Solid boundary awaits. */
export const runSpotify = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect);

export const getProfile = () =>
  request(SpotifyProfile, "https://api.spotify.com/v1/me");

/** Every saved-albums entry, whether or not its album can be rendered. */
const savedAlbumPage = Schema.Struct({
  items: Schema.Array(Schema.Unknown),
  next: Schema.NullOr(Schema.String),
  total: Schema.Number,
  limit: Schema.Number,
  offset: Schema.Number,
});

/**
 * The album on a saved-albums entry, or `undefined` when the entry has none.
 *
 * Spotify returns saved entries with no album, for example one pulled from the
 * catalog or unavailable in the user's market. Such an entry cannot be shown,
 * but it also must not fail the whole page, so each entry is decoded on its own.
 */
const savedAlbum = (entry: unknown): SpotifyItem | undefined => {
  if (typeof entry !== "object" || entry === null || !("album" in entry)) {
    return undefined;
  }
  return Option.getOrUndefined(
    Schema.decodeUnknownOption(SpotifyItem)(entry.album),
  );
};

export const getTopTracksPage = (range: "long" | "medium" | "short", offset = 0) =>
  request(
    page(SpotifyItem),
    `https://api.spotify.com/v1/me/top/tracks?limit=50&offset=${offset}&time_range=${range}_term`,
  ).pipe(
    Effect.map(
      (data): SpotifyListing<SpotifyItem> => ({
        items: data.items,
        next: data.next,
        nextOffset: data.offset + data.items.length,
      }),
    ),
  );

export const getSavedAlbumsPage = (offset = 0) =>
  request(
    savedAlbumPage,
    `https://api.spotify.com/v1/me/albums?limit=50&offset=${offset}`,
  ).pipe(
    Effect.map(
      (data): SpotifyListing<SpotifyItem> => ({
        items: data.items.flatMap((entry) => {
          const album = savedAlbum(entry);
          return album ? [album] : [];
        }),
        next: data.next,
        // Spotify's numbering, not the kept rows: a skipped album must not
        // shift the offset every later page is requested at.
        nextOffset: data.offset + data.items.length,
      }),
    ),
  );

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

/** Only the synthetic library entry has no playlist ID. */
export const isLikedSongs = (playlist: Playlist) =>
  playlist.id === undefined && playlist.name === "Liked Songs";

export const getExportTracksPage = (playlist: Playlist, offset = 0) =>
  isLikedSongs(playlist)
    ? getLikedTracksPage(offset)
    : getPlaylistTracksPage(playlist.id ?? "", offset);

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

export const CatalogTrack = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  name: Schema.String,
  artists: Schema.Array(Schema.Struct({ id: Schema.NullOr(Schema.String), name: Schema.String })),
  album: Schema.Struct({ images: Schema.Array(Image) }),
  external_urls: Schema.Struct({ spotify: Schema.String }),
  is_local: Schema.optional(Schema.Boolean),
  is_playable: Schema.optional(Schema.Boolean),
  restrictions: Schema.optional(Schema.Struct({ reason: Schema.String })),
  linked_from: Schema.optional(Schema.Struct({ id: Schema.String })),
});
export type CatalogTrack = typeof CatalogTrack.Type;

export const getRecommendations = (seeds: readonly string[], attributes: Readonly<Record<string, number>>) =>
  request(
    Schema.Struct({ tracks: Schema.Array(CatalogTrack) }),
    `https://api.spotify.com/v1/recommendations?${new URLSearchParams({
      seed_tracks: seeds.slice(0, 5).join(","), limit: "100",
      ...Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, String(value)])),
    })}`,
  );

export const getDiscoveryTopTracks = () =>
  request(page(CatalogTrack), "https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term");

export const getCatalogTracks = (ids: readonly string[]) =>
  request(Schema.Struct({ tracks: Schema.Array(Schema.NullOr(CatalogTrack)) }),
    `https://api.spotify.com/v1/tracks?${new URLSearchParams({ ids: ids.join(",") })}`);

export const getSavedTrackFlags = (ids: readonly string[]) =>
  request(Schema.Array(Schema.Boolean), `https://api.spotify.com/v1/me/tracks/contains?${new URLSearchParams({ ids: ids.join(",") })}`);

export const CreatedPlaylist = Schema.Struct({ id: Schema.String, external_urls: Schema.Struct({ spotify: Schema.String }) });
export type CreatedPlaylist = typeof CreatedPlaylist.Type;

export const createPrivatePlaylist = (name: string) =>
  request(CreatedPlaylist, "https://api.spotify.com/v1/me/playlists", {
    method: "POST", body: { name, public: false, collaborative: false, description: "Selected with Spotistats. Music supplied by Spotify." },
  });

/** Replace only the new playlist we just created, so an explicit retry cannot append duplicates. */
export const setDiscoveryPlaylistTracks = (id: string, trackIds: readonly string[]) =>
  request(Schema.Struct({ snapshot_id: Schema.String }), `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/items`, {
    method: "PUT", body: { uris: trackIds.map((trackId) => `spotify:track:${trackId}`) },
  });
