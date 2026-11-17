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

/**
 * The side effects an export performs.
 *
 * Injected so the queue can be exercised with faithful doubles without
 * replacing the modules that own the CSV build and the download.
 */
export interface ExportDependencies {
  buildPlaylistCsv: typeof buildPlaylistCsv;
  downloadTextFile: typeof downloadTextFile;
  safeFileName: typeof safeFileName;
}

const realDependencies: ExportDependencies = {
  buildPlaylistCsv,
  downloadTextFile,
  safeFileName,
};

const queue: string[] = [];

const pending = new Map<string, Playlist>();

const patchExportJob = (id: string, patch: Partial<ExportJob>) =>
  setExportJobs((jobs) =>
    jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
  );

/**
 * Queues an export for each playlist that is not already queued or running.
 * Returns immediately; the jobs run in the background.
 */
export function startPlaylistExports(
  playlists: readonly Playlist[],
  dependencies: ExportDependencies = realDependencies,
) {
  const known = new Set([
    ...exportJobs().filter(isExportActive).map((job) => job.id),
    ...queue,
  ]);

  const fresh = playlists.filter((playlist) => {
    const id = exportJobId(playlist);

    if (known.has(id)) return false;

    known.add(id);

    return true;
  });

  fresh.forEach((playlist) => {
    const id = exportJobId(playlist);
    pending.set(id, playlist);
    queue.push(id);
  });

  if (fresh.length === 0) return;
  const freshIds = new Set(fresh.map(exportJobId));
  setExportJobs((jobs) => [
    // Re-exporting a finished playlist replaces its old row instead of
    // stacking a second job under the same id.
    ...jobs.filter((job) => !freshIds.has(job.id)),
    ...fresh.map((playlist) => ({
      id: exportJobId(playlist),
      name: playlist.name,
      status: "queued" as const,
      progress: 0,
      error: null,
    })),
  ]);
  void drainQueue(dependencies);
}

/** Drops the finished jobs from the panel; running jobs are kept. */
export function clearFinishedExports() {
  setExportJobs((jobs) => jobs.filter(isExportActive));
}

const drainQueue = (() => {
  let draining = false;

  return async (dependencies: ExportDependencies) => {
    if (draining) return;
    draining = true;

    try {
      for (;;) {
        const id = queue.shift();

        if (id === undefined) break;
        const playlist = pending.get(id);

        if (!playlist) {
          patchExportJob(id, {
            status: "error",
            error: "This playlist is no longer available.",
          });
          continue;
        }

        patchExportJob(id, { status: "running", progress: 0 });

        try {
          const { csv, trackCount } = await dependencies.buildPlaylistCsv(playlist, (fraction) =>
            patchExportJob(id, { progress: fraction }),
          );

          dependencies.downloadTextFile(`${dependencies.safeFileName(playlist.name)}.csv`, csv);
          capture("playlist_exported", {
            kind: isLikedSongs(playlist) ? "liked_songs" : "playlist",
            trackCount,
          });
          patchExportJob(id, { status: "done", progress: 1 });
        } catch (error) {
          console.error("Spotify export failed", error);
          patchExportJob(id, { status: "error", error: errorMessage(error) });
        } finally {
          pending.delete(id);
        }
      }
    } finally {
      draining = false;
    }
  };
})();
