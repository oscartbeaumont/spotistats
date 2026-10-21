import {
  getArtists,
  getAudioFeatures,
  getExportTracksPage,
  runSpotify,
  type Playlist,
  type PlaylistTrack,
  type SpotifyPage,
} from "~/client/spotify";

import { csvCell } from "./download";

/**
 * Builds the CSV for one playlist.
 *
 * The audio features and artist genres need extra calls per page, so the pages
 * are fetched in parallel and progress is reported as they land. `onProgress`
 * receives a fraction in `[0, 1]`.
 */

export const playlistCsvHeader =
  "Spotify ID,Artist IDs,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms),Popularity,Added By,Added At,Genres,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo,Time Signature\n";

export async function buildPlaylistCsv(
  playlist: Playlist,
  onProgress: (fraction: number) => void = () => {},
): Promise<{ csv: string; trackCount: number }> {
  const fetchPage = (offset: number) =>
    runSpotify(getExportTracksPage(playlist, offset));

  const firstPage: SpotifyPage<PlaylistTrack> = await fetchPage(0);
  const pageCount = Math.ceil(firstPage.total / firstPage.limit);
  // Three progress steps per page: the page itself, audio features, artists.
  const step = 1 / 3 / Math.max(pageCount, 1);
  let done = 0;
  const advance = () => {
    done += step;
    onProgress(Math.min(1, done));
  };

  const pages = await Promise.all(
    Array.from({ length: pageCount }, async (_, index) => {
      const page =
        index === 0 ? firstPage : await fetchPage(index * firstPage.limit);
      advance();
      const items = page.items.filter((item) => item.track && !item.track.is_local);
      const ids = items
        .map((item) => item.track?.id)
        .filter((id): id is string => Boolean(id))
        .join(",");
      const audioFeatures = await runSpotify(getAudioFeatures(ids));
      advance();
      const artistIds = items
        .map((item) => item.track?.artists[0]?.id)
        .filter((id): id is string => Boolean(id));
      const artistsOne = await runSpotify(getArtists(artistIds.slice(0, 50).join(",")));
      const artistsTwo = await runSpotify(getArtists(artistIds.slice(50, 100).join(",")));
      advance();
      return { items, audioFeatures, artists: [...artistsOne, ...artistsTwo] };
    }),
  );

  let csv = playlistCsvHeader;
  let trackCount = 0;
  for (const page of pages) {
    const artistById = new Map(page.artists.map((artist) => [artist.id, artist]));
    for (const [index, item] of page.items.entries()) {
      const track = item.track;
      if (!track) continue;
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
          item.added_by?.id ?? "",
          item.added_at,
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
