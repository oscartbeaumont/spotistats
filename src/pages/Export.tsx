import JSZip from "jszip";
import { createMemo, createSignal, For, isPending, latest, Loading, Show } from "solid-js";

import {
  downloadBlob,
  playlistArchiveName,
} from "~/lib/download";
import { errorMessage } from "~/lib/errors";
import { PageHeader } from "~/components/PageHeader";
import { buildPlaylistCsv } from "~/lib/playlistExport";
import { createShortcut } from "~/lib/shortcut";
import { capture } from "~/client/analytics";
import { authStore } from "~/client/storage";
import {
  activeExportCount,
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

/** The progress line under an export job. */
function exportStatusLabel(job: ExportJob): string {
  switch (job.status) {
    case "queued":
      return "Queued_";
    case "running":
      return `Exporting ${Math.round(job.progress * 100)}%`;
    case "done":
      return "Downloaded";
    case "error":
      return `Failed: ${job.error ?? "unknown error"}`;
  }
}

/** Adds each exportable playlist to the archive, reporting progress and errors. */
async function archivePlaylists(
  zip: JSZip,
  playlists: ReadonlyArray<Playlist>,
  share: number,
  handlers: {
    readonly onProgress: (value: number) => void;
    readonly onError: (message: string) => void;
  },
): Promise<number> {
  let playlistCount = 0;

  const exportable = playlists.filter(
    (playlist) => isLikedSongs(playlist) || Boolean(playlist.id),
  );

  for (const [index, playlist] of exportable.entries()) {
    // The Liked Songs entry is synthesised client-side without an id, so
    // `buildPlaylistCsv` reaches it via the liked-tracks endpoint; other
    // id-less entries are malformed and skipped.
    const base = index * share;

    try {
      const { csv } = await buildPlaylistCsv(playlist, (fraction) =>
        handlers.onProgress(base + fraction * share),
      );

      zip.file(
        playlistArchiveName(playlist.name, (name) => zip.file(name) !== null),
        csv,
      );
      playlistCount += 1;
    } catch (error) {
      console.error("Spotify export failed", error);
      handlers.onError(errorMessage(error));
    }
  }

  return playlistCount;
}

/** One playlist row: selection, export trigger and live job progress. */
function PlaylistRow(props: {
  playlist: Playlist;
  index: number;
  focused: boolean;
  selected: boolean;
  backingUp: boolean;
  job: ExportJob | undefined;
  onFocus: () => void;
  onToggle: () => void;
  onExport: () => void;
}) {
  return (
    <div
      id={`playlist-${props.index}`}
      class={`flex w-full items-center gap-4 border-b-[3px] border-[#0a0a0a] py-3 transition ${
        props.focused ? "bg-[#0a0a0a] pl-2 text-[#f0ede8]" : ""
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={props.selected ? "true" : "false"}
        aria-label={`Select ${props.playlist.name}`}
        onClick={props.onToggle}
        class={`h-6 w-6 shrink-0 border-[3px] border-current text-center text-xs font-black leading-none ${
          props.selected ? "bg-[#1DB954] text-[#0a0a0a]" : ""
        }`}
      >
        {props.selected ? "✓" : ""}
      </button>
      <button
        type="button"
        onFocus={props.onFocus}
        onClick={props.onExport}
        disabled={props.backingUp}
        class="flex min-w-0 flex-1 items-center gap-4 text-left outline-none disabled:opacity-60"
      >
        <img
          src={props.playlist.images?.[0]?.url ?? "/assets/placeholder.svg"}
          alt={props.playlist.name}
          class="h-10 w-10 shrink-0 border-2 border-[#0a0a0a] object-cover"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-black uppercase tracking-tight">
            {props.playlist.name}
          </p>
          <p class="mt-0.5 truncate text-xs text-[#5c5c5c]">
            {props.playlist.owner?.display_name}
          </p>
          <Show when={props.job}>
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
                  {exportStatusLabel(value())}
                </p>
              </div>
            )}
          </Show>
        </div>
      </button>
      <div class="flex shrink-0 gap-2">
        {props.playlist.collaborative && (
          <span class="text-xs uppercase tracking-widest font-bold text-[#5c5c5c]">
            Collab
          </span>
        )}
        {!props.playlist.public && !props.playlist.collaborative && (
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
}

/** The page actions: export the selection, or back up the whole library. */
function ExportHeader(props: {
  selectedCount: number;
  backingUp: boolean;
  backupDisabled: boolean;
  onExportSelected: () => void;
  onBackupAll: () => void;
}) {
  return (
    <PageHeader
      title="Export Data"
      actions={
        <>
          <Show when={props.selectedCount > 0}>
            <button
              onClick={props.onExportSelected}
              disabled={props.backingUp}
              class="font-black text-xs uppercase px-4 py-2 tracking-wide transition border-[3px] border-[#0a0a0a] bg-[#1DB954] hover:bg-[#0a0a0a] hover:text-[#1DB954] disabled:opacity-50"
            >
              Export selected ({props.selectedCount})
            </button>
          </Show>
          <button
            onClick={props.onBackupAll}
            disabled={props.backupDisabled}
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
  );
}

/** The backup progress bar and the last export failure. */
function ExportNotices(props: {
  backingUp: boolean;
  progress: number;
  error: string | null;
}) {
  return (
    <>
      <Show when={props.backingUp}>
        <progress
          aria-label="Backup progress"
          class="mb-6 h-4 w-full border-[3px] border-[#0a0a0a] accent-[#1DB954]"
          value={props.progress}
          max="1"
        />
      </Show>
      <Show when={props.error}>
        {(error) => (
          <p class="mb-6 border-4 border-red-800 p-4 text-sm text-red-700">
            Export failed: {error()}
          </p>
        )}
      </Show>
    </>
  );
}

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
    if (backingUp()) return;
    const chosen = selectedPlaylists();

    if (chosen.length === 0) return;
    setExportError(null);
    startPlaylistExports(chosen);
    setSelected(new Set<string>());
  };

  const exportPlaylist = (playlist: Playlist) => {
    if (backingUp()) return;
    setExportError(null);
    startPlaylistExports([playlist]);
  };

  async function backupAll() {
    const all = loadedPlaylists();

    // The header renders before the playlist list resolves. Starting here with
    // an empty list downloaded a `Music.zip` that held only `user.json`.
    // The background store also runs one export at a time for rate limits, so
    // do not start a second batch on top of it.
    if (backingUp() || activeExportCount() > 0 || all.length === 0) return;
    setBackingUp(true);
    setBackupProgress(0);
    setExportError(null);

    try {
      const zip = new JSZip();
      const share = 1 / Math.max(all.length, 1);

      const playlistCount = await archivePlaylists(zip, all, share, {
        onProgress: setBackupProgress,
        onError: (message) => setExportError(message),
      });

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

  createShortcut(["j"], () => moveFocus(1));
  createShortcut(["k"], () => moveFocus(-1));
  createShortcut(["ArrowDown"], () => moveFocus(1));
  createShortcut(["ArrowUp"], () => moveFocus(-1));
  createShortcut(["Enter"], () => {
    const focused = loadedPlaylists()[focusedIndex()];

    if (focused) exportPlaylist(focused);
  });
  createShortcut([" "], () => {
    const focused = loadedPlaylists()[focusedIndex()];

    if (focused) toggleSelected(focused);
  });
  createShortcut(["b"], () => void backupAll());
  createShortcut(["e"], exportSelected);

  return (
    <main class="app-main p-8 md:p-12">
      <ExportHeader
        selectedCount={selectedPlaylists().length}
        backingUp={backingUp()}
        backupDisabled={
          backingUp() ||
          activeExportCount() > 0 ||
          loadedPlaylists().length === 0
        }
        onExportSelected={exportSelected}
        onBackupAll={backupAll}
      />
      <ExportNotices
        backingUp={backingUp()}
        progress={backupProgress()}
        error={exportError()}
      />
      <Loading fallback={<p class="text-sm uppercase tracking-widest text-[#5c5c5c]">LOADING_</p>}>
        <For each={playlistItems()}>
          {(playlist, index) => (
            <PlaylistRow
              playlist={playlist}
              index={index()}
              focused={focusedIndex() === index()}
              selected={isSelected(playlist)}
              backingUp={backingUp()}
              job={jobFor(playlist)}
              onFocus={() => setFocusedIndex(index())}
              onToggle={() => toggleSelected(playlist)}
              onExport={() => exportPlaylist(playlist)}
            />
          )}
        </For>
      </Loading>
    </main>
  );
}
