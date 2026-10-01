import { Schema } from "effect";
import { untrack } from "solid-js";

import { authStore, setAuthStore } from "./storage";

/**
 * Browser-side typed client for the Spotify Web API.
 *
 * Responses are validated with Effect Schema and every failure is a declared
 * tagged error, so UI error boundaries can tell "session expired" apart from
 * "Spotify is having a bad day".
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

export class SpotifyUnauthenticatedError extends Error {
  readonly _tag = "SpotifyUnauthenticatedError";
  constructor() {
    super("Spotistats: 401 Unauthorized");
    this.name = "SpotifyUnauthenticatedError";
  }
}

export class SpotifyApiError extends Error {
  readonly _tag = "SpotifyApiError";
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Spotistats: ${status}`);
    this.name = "SpotifyApiError";
  }
}

const Image = Schema.Struct({ url: Schema.String });
const Named = Schema.Struct({ name: Schema.String });

export const SpotifyProfile = Schema.Struct({
  id: Schema.String,
  display_name: Schema.String,
  email: Schema.optional(Schema.String),
  uri: Schema.String,
  external_urls: Schema.Struct({ spotify: Schema.String }),
  followers: Schema.Struct({ total: Schema.Number }),
  images: Schema.Array(Image),
});

export const SpotifyItem = Schema.Struct({
  name: Schema.String,
  type: Schema.optional(Schema.String),
  uri: Schema.String,
  external_urls: Schema.Struct({ spotify: Schema.String }),
  images: Schema.optional(Schema.Array(Image)),
  artists: Schema.optional(Schema.Array(Named)),
  album: Schema.optional(
    Schema.Struct({ images: Schema.optional(Schema.Array(Image)) }),
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
  id: Schema.optional(Schema.String),
  name: Schema.String,
  public: Schema.optional(Schema.Boolean),
  collaborative: Schema.optional(Schema.Boolean),
  owner: Schema.optional(Schema.Struct({ display_name: Schema.String })),
  images: Schema.Array(Image),
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
  id: Schema.String,
  is_local: Schema.Boolean,
  name: Schema.String,
  album: Schema.Struct({ name: Schema.String, release_date: Schema.String }),
  artists: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  duration_ms: Schema.Number,
  popularity: Schema.Number,
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

const Artist = Schema.Struct({ genres: Schema.Array(Schema.String) });
export type SpotifyArtist = typeof Artist.Type;

const decodeSync = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
): S["Type"] => {
  try {
    return Schema.decodeUnknownSync(schema)(value);
  } catch (error) {
    throw new SpotifyApiError(200, {
      error: "Spotify returned an unexpected response shape",
      detail: String(error),
    });
  }
};

const RETRYABLE = [429, 500, 502, 503];

const spotifyFetch = async <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  url: string,
  options?: RequestInit,
): Promise<S["Type"]> => {
  const store = untrack(() => authStore());
  if (store.status !== "authenticated") throw new SpotifyUnauthenticatedError();

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: {
        Authorization: store.accessToken,
        ...(options?.headers ?? {}),
      },
    });

    if (response.status === 401) {
      setAuthStore({ status: "empty" });
      throw new SpotifyUnauthenticatedError();
    }

    if (response.status === 204) return decodeSync(schema, null);

    if (response.ok) return decodeSync(schema, await response.json());

    lastStatus = response.status;
    if (!RETRYABLE.includes(response.status)) {
      const body = await response.json().catch(() => ({ status: response.status }));
      throw new SpotifyApiError(response.status, body);
    }

    const retryAfter = Number(response.headers.get("retry-after") ?? "1") + 1;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  }

  throw new SpotifyApiError(lastStatus, { status: lastStatus });
};

export const getProfile = () =>
  spotifyFetch(SpotifyProfile, "https://api.spotify.com/v1/me");

export const getTopTracksPage = (range: "long" | "medium" | "short", offset = 0) =>
  spotifyFetch(
    page(SpotifyItem),
    `https://api.spotify.com/v1/me/top/tracks?limit=50&offset=${offset}&time_range=${range}_term`,
  );

export const getSavedAlbumsPage = (offset = 0) =>
  spotifyFetch(
    Schema.Struct({
      items: Schema.Array(Schema.Struct({ album: SpotifyItem })),
      next: Schema.NullOr(Schema.String),
      total: Schema.Number,
      limit: Schema.Number,
      offset: Schema.Number,
    }),
    `https://api.spotify.com/v1/me/albums?limit=50&offset=${offset}`,
  ).then((data) => ({ ...data, items: data.items.map((entry) => entry.album) }));

export const getPlaylists = async () => {
  const schema = Schema.Struct({
    items: Schema.Array(Playlist),
    next: Schema.NullOr(Schema.String),
  });
  let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";
  let value: Playlist[] = [];
  while (url) {
    const data: { readonly items: ReadonlyArray<Playlist>; readonly next: string | null } =
      await spotifyFetch(schema, url);
    value = [...value, ...data.items];
    url = data.next;
  }
  return [{ name: "Liked Songs", public: true, images: [] }, ...value];
};

export const getCurrentlyPlaying = () =>
  spotifyFetch(Schema.NullOr(CurrentlyPlaying), "https://api.spotify.com/v1/me/player/currently-playing");

export const getLikedTracksPage = (offset = 0) =>
  spotifyFetch(
    page(PlaylistTrack),
    `https://api.spotify.com/v1/me/tracks?limit=50&offset=${offset}`,
  );

export const getPlaylistTracksPage = (playlistId: string, offset = 0) =>
  spotifyFetch(
    page(PlaylistTrack),
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&offset=${offset}`,
  );

export const getAudioFeatures = (ids: string) =>
  ids
    ? spotifyFetch(
        Schema.Struct({ audio_features: Schema.Array(AudioFeatures) }),
        `https://api.spotify.com/v1/audio-features?ids=${ids}`,
      ).then((data) => data.audio_features)
    : Promise.resolve([] as ReadonlyArray<AudioFeatures>);

export const getArtists = (ids: string) =>
  ids
    ? spotifyFetch(
        Schema.Struct({ artists: Schema.Array(Artist) }),
        `https://api.spotify.com/v1/artists?ids=${ids}`,
      ).then((data) => data.artists)
    : Promise.resolve([] as ReadonlyArray<SpotifyArtist>);
