import JSZip from "jszip";
import { createMemo, createSignal, For, isPending, latest, Loading, Show } from "solid-js";

import {
  downloadBlob,
  playlistArchiveName,
} from "~/lib/download";
import { errorMessage } from "~/lib/errors";
import { PageHeader } from "~/components/PageHeader";
import { buildPlaylistCsv } from "~/lib/playlistExport";
import { createShortcut, isEditableShortcutTarget } from "~/lib/shortcut";
import { capture } from "~/client/analytics";
import { authStore } from "~/client/storage";
import {
  exportJobId,
  exportJobs,
  startPlaylistExports,
  type ExportJob,
} from "~/client/exportStore";
import {
  getPlaylists,
  isLikedSongs,
  runSpotify,
  type Playlist,
} from "~/client/spotify";

export default function ExportPage() {
  const [backupProgress, setBackupProgress] = createSignal(0);
  const [backingUp, setBackingUp] = createSignal(false);
  const [exportError, setExportError] = createSignal<string | null>(null);
  const [focusedIndex, setFocusedIndex] = createSignal(0);
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());

  const playlists = createMemo(() => runSpotify(getPlaylists()));
  const playlistItems = () => playlists();
  /** Non-suspending read for handlers, effects, and the progress timer. */
  const loadedPlaylists = (): readonly Playlist[] => {
    try {
      return isPending(playlists) ? [] : (latest(playlists) ?? []);
    } catch {
      return [];
    }
  };

  const jobFor = (playlist: Playlist): ExportJob | undefined =>
    exportJobs().find((job) => job.id === exportJobId(playlist));

  const isSelected = (playlist: Playlist) => selected().has(exportJobId(playlist));

  const toggleSelected = (playlist: Playlist) => {
    const id = exportJobId(playlist);
    setSelected((current) => {
      const next = new Set<string>(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedPlaylists = () =>
    loadedPlaylists().filter((playlist) => isSelected(playlist));

  const exportSelected = () => {
    const chosen = selectedPlaylists();
    if (chosen.length === 0) return;
    setExportError(null);
    startPlaylistExports(chosen);
    setSelected(new Set<string>());
  };

  const exportPlaylist = (playlist: Playlist) => {
    setExportError(null);
    startPlaylistExports([playlist]);
  };

  async function backupAll() {
    const all = loadedPlaylists();
    if (backingUp()) return;
    setBackingUp(true);
    setBackupProgress(0);
    setExportError(null);
    try {
      const zip = new JSZip();
      const share = 1 / Math.max(all.length, 1);
      let index = 0;
      let playlistCount = 0;
      for (const playlist of all) {
        // The Liked Songs entry is synthesised client-side without an id, so
        // `buildPlaylistCsv` reaches it via the liked-tracks endpoint; other
        // id-less entries are malformed and skipped.
        if (!isLikedSongs(playlist) && !playlist.id) continue;
        const base = index * share;
        try {
          const { csv } = await buildPlaylistCsv(playlist, (fraction) =>
            setBackupProgress(base + fraction * share),
          );
          zip.file(
            playlistArchiveName(playlist.name, (name) => zip.file(name) !== null),
            csv,
          );
          playlistCount += 1;
        } catch (error) {
          console.error("Spotify export failed", error);
          setExportError(errorMessage(error));
        }
        index += 1;
      }
      const store = authStore();
      zip.file(
        "user.json",
        JSON.stringify(store.status === "authenticated" ? store.profile : null),
      );
      downloadBlob("Music.zip", await zip.generateAsync({ type: "blob" }));
      capture("library_backed_up", { playlistCount });
    } catch (error) {
      console.error("Spotify backup failed", error);
      setExportError(errorMessage(error));
    } finally {
      setBackingUp(false);
      setBackupProgress(0);
    }
  }

  function moveFocus(delta: number) {
    const next = Math.max(
      0,
      Math.min(focusedIndex() + delta, loadedPlaylists().length - 1),
    );
    setFocusedIndex(next);
    document
      .getElementById(`playlist-${next}`)
      ?.scrollIntoView({ block: "nearest" });
  }

  createShortcut(["j"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveFocus(1);
  });
  createShortcut(["k"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveFocus(-1);
  });
  createShortcut(["ArrowDown"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveFocus(1);
  });
  createShortcut(["ArrowUp"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveFocus(-1);
  });
  createShortcut(["Enter"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    const focused = loadedPlaylists()[focusedIndex()];
    if (focused) exportPlaylist(focused);
  });
  createShortcut([" "], (event) => {
    if (isEditableShortcutTarget(event)) return;
    const focused = loadedPlaylists()[focusedIndex()];
    if (focused) {
      event.preventDefault();
      toggleSelected(focused);
    }
  });
  createShortcut(["b"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    void backupAll();
  });
  createShortcut(["e"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    exportSelected();
  });

  return (
    <main class="app-main p-8 md:p-12">
      <PageHeader
        title="Export Data"
        actions={
          <>
            <Show when={selectedPlaylists().length > 0}>
              <button
                onClick={exportSelected}
                class="font-black text-xs uppercase px-4 py-2 tracking-wide transition border-[3px] border-[#0a0a0a] bg-[#1DB954] hover:bg-[#0a0a0a] hover:text-[#1DB954]"
              >
                Export selected ({selectedPlaylists().length})
              </button>
            </Show>
            <button
              onClick={backupAll}
              disabled={backingUp()}
              class="font-black text-xs uppercase px-4 py-2 tracking-wide transition border-[3px] border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8] disabled:opacity-50"
            >
              Backup All <span class="ml-2 text-[0.6rem] opacity-50">B</span> →
            </button>
          </>
        }
        hints={
          <>
            <span>J/↓ Next</span>
            <span>K/↑ Previous</span>
            <span>Enter Export</span>
            <span>Space Select</span>
            <span>E Export Selected</span>
            <span>B Backup All</span>
          </>
        }
      />
      <Show when={backingUp()}>
        <progress
          aria-label="Backup progress"
          class="mb-6 h-4 w-full border-[3px] border-[#0a0a0a] accent-[#1DB954]"
          value={backupProgress()}
          max="1"
        />
      </Show>
      <Show when={exportError()}>
        {(error) => (
          <p class="mb-6 border-4 border-red-800 p-4 text-sm text-red-700">
            Export failed: {error()}
          </p>
        )}
      </Show>
      <Loading fallback={<p class="text-sm uppercase tracking-widest text-[#5c5c5c]">LOADING_</p>}>
        <For each={playlistItems()}>
          {(playlist, index) => {
            const job = () => jobFor(playlist);
            return (
              <div
                id={`playlist-${index()}`}
                class={`flex w-full items-center gap-4 border-b-[3px] border-[#0a0a0a] py-3 transition ${
                  focusedIndex() === index() ? "bg-[#0a0a0a] pl-2 text-[#f0ede8]" : ""
                }`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected(playlist) ? "true" : "false"}
                  aria-label={`Select ${playlist.name}`}
                  onClick={() => toggleSelected(playlist)}
                  class={`h-6 w-6 shrink-0 border-[3px] border-current text-center text-xs font-black leading-none ${
                    isSelected(playlist) ? "bg-[#1DB954] text-[#0a0a0a]" : ""
                  }`}
                >
                  {isSelected(playlist) ? "✓" : ""}
                </button>
                <button
                  type="button"
                  onFocus={() => setFocusedIndex(index())}
                  onClick={() => exportPlaylist(playlist)}
                  class="flex min-w-0 flex-1 items-center gap-4 text-left outline-none"
                >
                  <img
                    src={playlist.images?.[0]?.url ?? "/assets/placeholder.svg"}
                    alt={playlist.name}
                    class="h-10 w-10 shrink-0 border-2 border-[#0a0a0a] object-cover"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-black uppercase tracking-tight">
                      {playlist.name}
                    </p>
                    <p class="mt-0.5 truncate text-xs text-[#5c5c5c]">
                      {playlist.owner?.display_name}
                    </p>
                    <Show when={job()}>
                      {(value) => (
                        <div class="mt-2">
                          <div class="h-2 w-full border-[2px] border-current">
                            <div
                              class={`h-full origin-left ${
                                value().status === "error" ? "bg-red-600" : "bg-[#1DB954]"
                              }`}
                              style={`width:${Math.round(value().progress * 100)}%`}
                            />
                          </div>
                          <p class="mt-1 text-[0.6rem] uppercase tracking-widest">
                            {value().status === "queued"
                              ? "Queued_"
                              : value().status === "running"
                                ? `Exporting ${Math.round(value().progress * 100)}%`
                                : value().status === "done"
                                  ? "Downloaded"
                                  : `Failed: ${value().error ?? "unknown error"}`}
                          </p>
                        </div>
                      )}
                    </Show>
                  </div>
                </button>
                <div class="flex shrink-0 gap-2">
                  {playlist.collaborative && (
                    <span class="text-xs uppercase tracking-widest font-bold text-[#5c5c5c]">
                      Collab
                    </span>
                  )}
                  {!playlist.public && !playlist.collaborative && (
                    <span class="text-xs uppercase tracking-widest font-bold text-[#5c5c5c]">
                      Private
                    </span>
                  )}
                  <span class="text-xs uppercase tracking-widest font-bold text-[#1DB954]">
                    ↓ CSV
                  </span>
                </div>
              </div>
            );
          }}
        </For>
      </Loading>
    </main>
  );
}
