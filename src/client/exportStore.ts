import { createSignal } from "solid-js";

import { capture } from "~/client/analytics";
import { downloadTextFile, safeFileName } from "~/lib/download";
import { errorMessage } from "~/lib/errors";
import { buildPlaylistCsv } from "~/lib/playlistExport";
import { isLikedSongs, type Playlist } from "./spotify";

/**
 * Background playlist exports.
 *
 * The state lives at module scope, not in the Export page, so a download keeps
 * running while the user navigates and its progress stays visible. Exports run
 * one at a time to stay within Spotify's rate limits.
 *
 * The work queue is a plain array, not the signal: a signal write is not
 * readable again until the next flush, so control flow must not depend on it.
 */

export type ExportStatus = "queued" | "running" | "done" | "error";

export interface ExportJob {
  readonly id: string;
  readonly name: string;
  readonly status: ExportStatus;
  readonly progress: number;
  readonly error: string | null;
}

const [exportJobs, setExportJobs] = createSignal<readonly ExportJob[]>([]);
export { exportJobs };

export const isExportActive = (job: ExportJob) =>
  job.status === "queued" || job.status === "running";

export const activeExportCount = () => exportJobs().filter(isExportActive).length;

/** Only the synthetic library entry has no id, so the name disambiguates it. */
export const exportJobId = (playlist: Playlist) =>
  playlist.id ?? `liked:${playlist.name}`;

const queue: string[] = [];
const pending = new Map<string, Playlist>();
let draining = false;

const update = (id: string, patch: Partial<ExportJob>) =>
  setExportJobs((jobs) =>
    jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
  );

/**
 * Queues an export for each playlist that is not already queued or running.
 * Returns immediately; the jobs run in the background.
 */
export function startPlaylistExports(playlists: readonly Playlist[]) {
  const known = new Set([
    ...exportJobs().filter(isExportActive).map((job) => job.id),
    ...queue,
  ]);
  const fresh: Playlist[] = [];
  for (const playlist of playlists) {
    const id = exportJobId(playlist);
    if (known.has(id)) continue;
    known.add(id);
    pending.set(id, playlist);
    queue.push(id);
    fresh.push(playlist);
  }
  if (fresh.length === 0) return;
  setExportJobs((jobs) => [
    ...jobs,
    ...fresh.map((playlist) => ({
      id: exportJobId(playlist),
      name: playlist.name,
      status: "queued" as const,
      progress: 0,
      error: null,
    })),
  ]);
  void drain();
}

/** Drops the finished jobs from the panel; running jobs are kept. */
export function clearFinishedExports() {
  setExportJobs((jobs) => jobs.filter(isExportActive));
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const id = queue.shift();
      if (id === undefined) break;
      const playlist = pending.get(id);
      if (!playlist) {
        update(id, {
          status: "error",
          error: "This playlist is no longer available.",
        });
        continue;
      }
      update(id, { status: "running", progress: 0 });
      try {
        const { csv, trackCount } = await buildPlaylistCsv(playlist, (fraction) =>
          update(id, { progress: fraction }),
        );
        downloadTextFile(`${safeFileName(playlist.name)}.csv`, csv);
        capture("playlist_exported", {
          kind: isLikedSongs(playlist) ? "liked_songs" : "playlist",
          trackCount,
        });
        update(id, { status: "done", progress: 1 });
      } catch (error) {
        console.error("Spotify export failed", error);
        update(id, { status: "error", error: errorMessage(error) });
      } finally {
        pending.delete(id);
      }
    }
  } finally {
    draining = false;
  }
}
