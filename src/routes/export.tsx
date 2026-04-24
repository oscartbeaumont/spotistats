import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import JSZip from "jszip";
import { createSignal, For, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { ItemCard } from "~/components/ItemCard";
import { csvCell, downloadTextFile } from "~/lib/download";
import { accessToken, profileCache } from "~/lib/storage";
import { hasSpotifyCallbackCode, useSpotifyFetch } from "~/lib/spotify";

type Playlist = {
  id?: string;
  name: string;
  public?: boolean;
  collaborative?: boolean;
  owner?: { display_name: string };
  images: { url: string }[];
};
type SpotifyPage<T> = { items: T[]; next: string | null; total: number; limit: number };
type TrackItem = {
  added_by?: { id: string };
  added_at: string;
  track?: {
    id: string;
    is_local: boolean;
    name: string;
    album: { name: string; release_date: string };
    artists: { id: string; name: string }[];
    duration_ms: number;
    popularity: number;
  };
};
type AudioFeature = Record<"danceability" | "energy" | "speechiness" | "acousticness" | "instrumentalness" | "liveness" | "valence" | "tempo" | "key" | "loudness" | "mode" | "time_signature", number>;
type Artist = { genres: string[] };

const csvHeader = "Spotify ID,Artist IDs,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms),Popularity,Added By,Added At,Genres,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo,Time Signature\n";

export default function ExportPage() {
  const navigate = useNavigate();
  const spotifyFetch = useSpotifyFetch();
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  onMount(() => {
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/login", { replace: true });
  });

  const playlists = createQuery(() => ({
    queryKey: ["spotify", "playlists", accessToken()],
    enabled: !isServer && !!accessToken(),
    queryFn: async () => {
      let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";
      let value: Playlist[] = [];
      while (url) {
        const data: SpotifyPage<Playlist> = await spotifyFetch(url);
        value = value.concat(data.items);
        url = data.next;
      }
      return [{ name: "Liked Songs", public: true, images: [] }, ...value];
    },
  }));

  async function downloadUrl(baseUrl: string, totalProgress = 1) {
    let csv = csvHeader;
    const firstPage: SpotifyPage<TrackItem> = await spotifyFetch(baseUrl);
    const pageCount = Math.ceil(firstPage.total / firstPage.limit);
    const progressIncrement = totalProgress / 3 / Math.max(pageCount, 1);
    const pages = await Promise.all(
      Array.from({ length: pageCount }, async (_, index) => {
        const page = index === 0 ? firstPage : await spotifyFetch<SpotifyPage<TrackItem>>(`${baseUrl}&offset=${index * firstPage.limit}`);
        setProgress(value => value + progressIncrement);
        const items = page.items.filter(item => item.track && !item.track.is_local);
        const ids = items.map(item => item.track?.id).filter(Boolean).join(",");
        const audioFeatures = ids ? await spotifyFetch<{ audio_features: AudioFeature[] }>(`https://api.spotify.com/v1/audio-features?ids=${ids}`) : { audio_features: [] };
        setProgress(value => value + progressIncrement);
        const artistIds = items.map(item => item.track?.artists[0]?.id).filter(Boolean);
        const artistsOne = artistIds.length ? await spotifyFetch<{ artists: Artist[] }>(`https://api.spotify.com/v1/artists?ids=${artistIds.slice(0, 50).join(",")}`) : { artists: [] };
        const artistsTwo = artistIds.length > 50 ? await spotifyFetch<{ artists: Artist[] }>(`https://api.spotify.com/v1/artists?ids=${artistIds.slice(50, 100).join(",")}`) : { artists: [] };
        setProgress(value => value + progressIncrement);
        return { items, audioFeatures: audioFeatures.audio_features, artists: artistsOne.artists.concat(artistsTwo.artists) };
      }),
    );

    for (const page of pages) {
      for (const [index, item] of page.items.entries()) {
        const track = item.track;
        if (!track) continue;
        const audio = page.audioFeatures[index];
        const artist = page.artists[index];
        csv += [
          track.id,
          track.artists.map(artist => artist.id).join(","),
          track.name,
          track.album.name,
          track.artists.map(artist => artist.name).join(","),
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
        ].map(csvCell).join(",") + "\n";
      }
    }
    return csv;
  }

  async function exportPlaylist(playlist: Playlist) {
    if (busy()) return alert("Please wait for current download to complete before starting another!");
    setBusy(true);
    setProgress(0);
    const baseUrl = playlist.name === "Liked Songs" ? "https://api.spotify.com/v1/me/tracks?limit=50" : `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=100`;
    downloadTextFile(`${playlist.name}.csv`, await downloadUrl(baseUrl));
    setBusy(false);
    setProgress(0);
  }

  async function backupAll() {
    const all = playlists.data ?? [];
    if (busy()) return alert("Please wait for current download to complete before starting another!");
    setBusy(true);
    setProgress(0);
    const zip = new JSZip();
    const totalProgress = 1 / Math.max(all.length, 1);
    for (const playlist of all) {
      if (playlist.name === "Liked Songs") continue;
      try {
        zip.file(`${playlist.name}.csv`, await downloadUrl(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=100`, totalProgress));
      } catch (error) {
        console.error(error);
      }
    }
    zip.file("user.json", JSON.stringify(profileCache()));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "Music.zip";
    anchor.click();
    URL.revokeObjectURL(url);
    setBusy(false);
    setProgress(0);
  }

  return (
    <main class="mx-auto max-w-5xl px-3 pb-12 sm:px-6">
      <Title>Spotistats | Export</Title>
      <header class="mb-4 border-b border-[#1DB954] pb-3 sm:flex sm:items-end sm:gap-6">
        <h1 class="text-3xl font-black">Export Data</h1>
        <button class="mt-3 text-zinc-300 transition hover:text-[#1DB954] sm:mt-0" onClick={backupAll}>Backup All</button>
      </header>
      <Show when={busy()}>
        <progress class="mx-auto mb-6 block h-2 w-2/5 accent-[#1DB954]" value={progress()} max="1" />
      </Show>
      <Show when={!playlists.isLoading} fallback={<p class="px-2 text-zinc-400">Loading playlists...</p>}>
        <div class="space-y-1">
          <For each={playlists.data}>{playlist => <ItemCard name={playlist.name} description={playlist.owner?.display_name} images={playlist.images} privateIcon={!playlist.public} collaborativeIcon={playlist.collaborative} onClick={() => exportPlaylist(playlist)} />}</For>
        </div>
      </Show>
    </main>
  );
}
