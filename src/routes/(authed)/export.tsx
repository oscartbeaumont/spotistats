import { createShortcut } from "@solid-primitives/keyboard";
import { Title } from "@solidjs/meta";
import { createQuery } from "@tanstack/solid-query";
import JSZip from "jszip";
import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { csvCell, downloadTextFile } from "~/lib/download";
import { isEditableShortcutTarget } from "~/lib/keyboard";
import { authStore } from "~/lib/storage";
import { playlistsQueryOptions, spotifyFetch, type Playlist, type SpotifyPage } from "~/lib/spotify";

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
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const playlists = createQuery(() => playlistsQueryOptions());
  const playlistItems = createMemo(() => playlists.data ?? []);
  const selectedPlaylist = () => playlistItems()[selectedIndex()];

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
          track.id, track.artists.map(a => a.id).join(","), track.name, track.album.name,
          track.artists.map(a => a.name).join(","), track.album.release_date, track.duration_ms,
          track.popularity, item.added_by?.id ?? "", item.added_at, artist?.genres.join(",") ?? "",
          audio?.danceability, audio?.energy, audio?.key, audio?.loudness, audio?.mode,
          audio?.speechiness, audio?.acousticness, audio?.instrumentalness, audio?.liveness,
          audio?.valence, audio?.tempo, audio?.time_signature,
        ].map(csvCell).join(",") + "\n";
      }
    }
    return csv;
  }

  async function exportPlaylist(playlist: Playlist) {
    if (busy()) return alert("Please wait for the current download to complete.");
    setBusy(true);
    setProgress(0);
    const baseUrl = playlist.name === "Liked Songs"
      ? "https://api.spotify.com/v1/me/tracks?limit=50"
      : `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=100`;
    downloadTextFile(`${playlist.name}.csv`, await downloadUrl(baseUrl));
    setBusy(false);
    setProgress(0);
  }

  async function backupAll() {
    const all = playlistItems();
    if (busy()) return alert("Please wait for the current download to complete.");
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
    const store = authStore();
    zip.file("user.json", JSON.stringify(store.status === "authenticated" ? store.profile : null));
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

  function moveSelection(delta: number) {
    const nextIndex = Math.max(0, Math.min(selectedIndex() + delta, playlistItems().length - 1));
    setSelectedIndex(nextIndex);
    document.getElementById(`playlist-${nextIndex}`)?.scrollIntoView({ block: "nearest" });
  }

  createEffect(() => {
    if (selectedIndex() >= playlistItems().length) setSelectedIndex(Math.max(playlistItems().length - 1, 0));
  });

  onMount(() => {
    createShortcut(["j"], event => {
      if (isEditableShortcutTarget(event)) return;
      event?.preventDefault();
      moveSelection(1);
    }, { preventDefault: false, requireReset: true });

    createShortcut(["k"], event => {
      if (isEditableShortcutTarget(event)) return;
      event?.preventDefault();
      moveSelection(-1);
    }, { preventDefault: false, requireReset: true });

    createShortcut(["ArrowDown"], event => {
      if (isEditableShortcutTarget(event)) return;
      event?.preventDefault();
      moveSelection(1);
    }, { preventDefault: false, requireReset: true });

    createShortcut(["ArrowUp"], event => {
      if (isEditableShortcutTarget(event)) return;
      event?.preventDefault();
      moveSelection(-1);
    }, { preventDefault: false, requireReset: true });

    createShortcut(["Enter"], event => {
      if (isEditableShortcutTarget(event)) return;
      event?.preventDefault();
      void exportPlaylist(selectedPlaylist());
    }, { preventDefault: false, requireReset: true });

    createShortcut(["b"], event => {
      if (isEditableShortcutTarget(event)) return;
      event?.preventDefault();
      void backupAll();
    }, { preventDefault: false, requireReset: true });
  });

  return (
    <main class="app-main p-8 md:p-12">
      <Title>Spotistats | Export</Title>
      <div class="flex flex-wrap items-baseline gap-6 mb-8" style="border-bottom: 4px solid #0a0a0a; padding-bottom: 1rem">
        <h1 class="text-2xl font-black uppercase tracking-tight">Export Data</h1>
        <button
          onClick={backupAll}
          class="font-black text-xs uppercase px-4 py-2 tracking-wide transition ml-auto"
          style="border: 3px solid #0a0a0a"
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#0a0a0a"; (e.currentTarget as HTMLElement).style.color = "#f0ede8"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = ""; }}
        >
          Backup All <span class="ml-2 text-[0.6rem] opacity-50">B</span> →
        </button>
      </div>
      <div class="mb-6 flex flex-wrap gap-2 text-[0.65rem] font-bold uppercase tracking-widest" style="color: #777">
        <span>J/↓ Next</span>
        <span>K/↑ Previous</span>
        <span>Enter Export</span>
        <span>B Backup All</span>
      </div>
      <Show when={busy()}>
        <div class="mb-6 h-4" style="border: 3px solid #0a0a0a">
          <div style={`background: #1DB954; height: 100%; width: ${progress() * 100}%; transition: width 0.3s`} />
        </div>
      </Show>
      <Show when={!playlists.isLoading} fallback={<p class="text-sm uppercase tracking-widest" style="color: #999">LOADING_</p>}>
        <div>
          <For each={playlistItems()}>
            {(playlist, index) => {
              const img = () => playlist.images?.[0]?.url;
              const selected = () => selectedIndex() === index();
              return (
                <button
                  id={`playlist-${index()}`}
                  type="button"
                  onFocus={() => setSelectedIndex(index())}
                  onClick={() => exportPlaylist(playlist)}
                  class="w-full flex items-center gap-4 py-3 text-left transition outline-none"
                  style={selected() ? "border-bottom: 3px solid #0a0a0a; background: #0a0a0a; color: #f0ede8; padding-left: 0.5rem" : "border-bottom: 3px solid #0a0a0a"}
                >
                  <img
                    src={img() ?? "/assets/placeholder.svg"}
                    alt={playlist.name}
                    class="h-10 w-10 object-cover shrink-0"
                    style="border: 2px solid #0a0a0a"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-black uppercase tracking-tight truncate">{playlist.name}</p>
                    <p class="text-xs truncate mt-0.5" style="color: #888">{playlist.owner?.display_name}</p>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    {playlist.collaborative && <span class="text-xs uppercase tracking-widest font-bold" style="color: #aaa">Collab</span>}
                    {!playlist.public && !playlist.collaborative && <span class="text-xs uppercase tracking-widest font-bold" style="color: #aaa">Private</span>}
                    <span class="text-xs uppercase tracking-widest font-bold" style="color: #1DB954">↓ CSV</span>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </main>
  );
}
