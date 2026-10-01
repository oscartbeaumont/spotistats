import { Title } from "@solidjs/meta";
import JSZip from "jszip";
import { createMemo, createSignal, For, Loading, Show } from "solid-js";

import { downloadBlob, downloadTextFile, csvCell } from "~/lib/download";
import { createShortcut, isEditableShortcutTarget } from "~/lib/shortcut";
import { authStore } from "~/client/storage";
import {
  getArtists,
  getAudioFeatures,
  getLikedTracksPage,
  getPlaylists,
  getPlaylistTracksPage,
  type Playlist,
  type PlaylistTrack,
  type SpotifyArtist,
  type AudioFeatures,
  type SpotifyPage,
} from "~/client/spotify";

const csvHeader =
  "Spotify ID,Artist IDs,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms),Popularity,Added By,Added At,Genres,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo,Time Signature\n";

export default function ExportPage() {
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const playlists = createMemo(() => getPlaylists());
  const playlistItems = () => playlists();

  async function downloadPage(
    fetchPage: (offset: number) => Promise<SpotifyPage<PlaylistTrack>>,
    totalProgress = 1,
  ) {
    let csv = csvHeader;
    const firstPage = await fetchPage(0);
    const pageCount = Math.ceil(firstPage.total / firstPage.limit);
    const progressIncrement = totalProgress / 3 / Math.max(pageCount, 1);
    const pages = await Promise.all(
      Array.from({ length: pageCount }, async (_, index) => {
        const page =
          index === 0 ? firstPage : await fetchPage(index * firstPage.limit);
        setProgress((value) => value + progressIncrement);
        const items = page.items.filter((item) => item.track && !item.track.is_local);
        const ids = items
          .map((item) => item.track?.id)
          .filter((id): id is string => Boolean(id))
          .join(",");
        const audioFeatures = await getAudioFeatures(ids);
        setProgress((value) => value + progressIncrement);
        const artistIds = items
          .map((item) => item.track?.artists[0]?.id)
          .filter((id): id is string => Boolean(id));
        const artistsOne = await getArtists(artistIds.slice(0, 50).join(","));
        const artistsTwo = await getArtists(artistIds.slice(50, 100).join(","));
        setProgress((value) => value + progressIncrement);
        return {
          items,
          audioFeatures,
          artists: [...artistsOne, ...artistsTwo] as SpotifyArtist[],
        };
      }),
    );

    for (const page of pages) {
      for (const [index, item] of page.items.entries()) {
        const track = item.track;
        if (!track) continue;
        const audio: AudioFeatures | undefined = page.audioFeatures[index];
        const artist: SpotifyArtist | undefined = page.artists[index];
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
      }
    }
    return csv;
  }

  const fetchFor = (playlist: Playlist) =>
    playlist.name === "Liked Songs"
      ? getLikedTracksPage
      : (offset: number) => getPlaylistTracksPage(playlist.id ?? "", offset);

  async function exportPlaylist(playlist: Playlist) {
    if (busy()) return alert("Please wait for the current download to complete.");
    setBusy(true);
    setProgress(0);
    const csv = await downloadPage(fetchFor(playlist));
    downloadTextFile(`${playlist.name}.csv`, csv);
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
      if (playlist.name === "Liked Songs" || !playlist.id) continue;
      try {
        zip.file(
          `${playlist.name}.csv`,
          await downloadPage(fetchFor(playlist), totalProgress),
        );
      } catch (error) {
        console.error(error);
      }
    }
    const store = authStore();
    zip.file(
      "user.json",
      JSON.stringify(store.status === "authenticated" ? store.profile : null),
    );
    downloadBlob("Music.zip", await zip.generateAsync({ type: "blob" }));
    setBusy(false);
    setProgress(0);
  }

  function moveSelection(delta: number) {
    const next = Math.max(
      0,
      Math.min(selectedIndex() + delta, playlistItems().length - 1),
    );
    setSelectedIndex(next);
    document
      .getElementById(`playlist-${next}`)
      ?.scrollIntoView({ block: "nearest" });
  }

  createShortcut(["j"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveSelection(1);
  });
  createShortcut(["k"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveSelection(-1);
  });
  createShortcut(["ArrowDown"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveSelection(1);
  });
  createShortcut(["ArrowUp"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveSelection(-1);
  });
  createShortcut(["Enter"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    const selected = playlistItems()[selectedIndex()];
    if (selected) void exportPlaylist(selected);
  });
  createShortcut(["b"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    void backupAll();
  });

  return (
    <main class="app-main p-8 md:p-12">
      <Title>Spotistats | Export</Title>
      <div class="flex flex-wrap items-baseline gap-6 mb-8 border-b-4 border-[#0a0a0a] pb-4">
        <h1 class="text-2xl font-black uppercase tracking-tight">Export Data</h1>
        <button
          onClick={backupAll}
          class="font-black text-xs uppercase px-4 py-2 tracking-wide transition ml-auto border-[3px] border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
        >
          Backup All <span class="ml-2 text-[0.6rem] opacity-50">B</span> →
        </button>
      </div>
      <div class="mb-6 flex flex-wrap gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-[#777]">
        <span>J/↓ Next</span>
        <span>K/↑ Previous</span>
        <span>Enter Export</span>
        <span>B Backup All</span>
      </div>
      <Show when={busy()}>
        <progress
          class="mb-6 h-4 w-full border-[3px] border-[#0a0a0a] accent-[#1DB954]"
          value={progress()}
          max="1"
        />
      </Show>
      <Loading fallback={<p class="text-sm uppercase tracking-widest text-[#999]">LOADING_</p>}>
        <For each={playlistItems()}>
          {(playlist, index) => (
            <button
              id={`playlist-${index()}`}
              type="button"
              onFocus={() => setSelectedIndex(index())}
              onClick={() => void exportPlaylist(playlist)}
              class={`w-full flex items-center gap-4 py-3 text-left transition outline-none border-b-[3px] border-[#0a0a0a] ${
                selectedIndex() === index() ? "bg-[#0a0a0a] pl-2 text-[#f0ede8]" : ""
              }`}
            >
              <img
                src={playlist.images?.[0]?.url ?? "/assets/placeholder.svg"}
                alt={playlist.name}
                class="h-10 w-10 object-cover shrink-0 border-2 border-[#0a0a0a]"
              />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-black uppercase tracking-tight truncate">
                  {playlist.name}
                </p>
                <p class="text-xs truncate mt-0.5 text-[#888]">
                  {playlist.owner?.display_name}
                </p>
              </div>
              <div class="flex gap-2 shrink-0">
                {playlist.collaborative && (
                  <span class="text-xs uppercase tracking-widest font-bold text-[#aaa]">
                    Collab
                  </span>
                )}
                {!playlist.public && !playlist.collaborative && (
                  <span class="text-xs uppercase tracking-widest font-bold text-[#aaa]">
                    Private
                  </span>
                )}
                <span class="text-xs uppercase tracking-widest font-bold text-[#1DB954]">
                  ↓ CSV
                </span>
              </div>
            </button>
          )}
        </For>
      </Loading>
    </main>
  );
}
