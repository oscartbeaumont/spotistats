import {
  getArtists,
  getAudioFeatures,
  getExportTracksPage,
  playlistTrack,
  runSpotify,
  type Playlist,
  type PlaylistTrack,
  type SpotifyPage,
} from "~/client/spotify";

import { csvCell } from "./download";

/**
 * Builds the CSV for one playlist.
 *
 * The audio features and artist genres need extra calls per page, so a few
 * pages are fetched at once and progress is reported as they land. Spotify
 * rate-limits bursts, so the concurrency stays bounded: a long playlist must
 * not open every page's requests at the same time. `onProgress` receives a
 * fraction in `[0, 1]`.
 */

export const playlistCsvHeader =
  "Spotify ID,Artist IDs,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms),Popularity,Added By,Added At,Genres,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo,Time Signature\n";

/** How many playlist pages may be in flight at once. */
const pageConcurrency = 4;

/** Runs `work` over `items` with at most `limit` in flight, keeping order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        results[index] = await work(items[index] as T, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function buildPlaylistCsv(
  playlist: Playlist,
  onProgress: (fraction: number) => void = () => {},
): Promise<{ csv: string; trackCount: number }> {
  const fetchPage = (offset: number) =>
    runSpotify(getExportTracksPage(playlist, offset));

  const firstPage: SpotifyPage<PlaylistTrack> = await fetchPage(0);
  // A limit of zero would otherwise make the page count infinite.
  const pageCount =
    firstPage.limit > 0
      ? Math.max(1, Math.ceil(firstPage.total / firstPage.limit))
      : 1;
  // Three progress steps per page: the page itself, audio features, artists.
  const step = 1 / 3 / Math.max(pageCount, 1);
  let done = 0;
  const advance = () => {
    done += step;
    onProgress(Math.min(1, done));
  };

  const pages = await mapLimit(
    Array.from({ length: pageCount }, (_, index) => index),
    pageConcurrency,
    async (index) => {
      const page =
        index === 0 ? firstPage : await fetchPage(index * firstPage.limit);
      advance();
      const entries = page.items.flatMap((entry) => {
        const track = playlistTrack(entry);
        return track ? [{ entry, track }] : [];
      });
      const ids = entries
        .map(({ track }) => track.id)
        .filter((id): id is string => Boolean(id))
        .join(",");
      const audioFeatures = await runSpotify(getAudioFeatures(ids));
      advance();
      // A page holds at most 50 items, and each item has one primary artist.
      const artistIds = entries
        .map(({ track }) => track.artists[0]?.id)
        .filter((id): id is string => Boolean(id));
      const artists = await runSpotify(getArtists(artistIds.join(",")));
      advance();
      return { entries, audioFeatures, artists };
    },
  );

  let csv = playlistCsvHeader;
  let trackCount = 0;
  for (const page of pages) {
    const artistById = new Map(page.artists.map((artist) => [artist.id, artist]));
    for (const [index, { entry, track }] of page.entries.entries()) {
      const audio = page.audioFeatures[index];
      const primaryArtistId = track.artists[0]?.id;
      const artist = primaryArtistId ? artistById.get(primaryArtistId) : undefined;
      csv +=
        [
          track.id,
          track.artists.map((value) => value.id).join(","),
          track.name,
          track.album.name,
          track.artists.map((value) => value.name).join(","),
          track.album.release_date,
          track.duration_ms,
          track.popularity,
          entry.added_by?.id ?? "",
          entry.added_at,
          artist?.genres.join(",") ?? "",
          audio?.danceability,
          audio?.energy,
          audio?.key,
          audio?.loudness,
          audio?.mode,
          audio?.speechiness,
          audio?.acousticness,
          audio?.instrumentalness,
          audio?.liveness,
          audio?.valence,
          audio?.tempo,
          audio?.time_signature,
        ]
          .map(csvCell)
          .join(",") + "\n";
      trackCount += 1;
    }
  }
  onProgress(1);
  return { csv, trackCount };
}
