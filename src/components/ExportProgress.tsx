import { For, Show } from "solid-js";

import {
  activeExportCount,
  clearFinishedExports,
  exportJobs,
} from "~/client/exportStore";

/**
 * A persistent panel for background playlist exports.
 *
 * It lives in the layout, not the Export page, so progress stays visible while
 * the user navigates and the export keeps running.
 */
export function ExportProgress() {
  const label = (status: string, progress: number) => {
    if (status === "queued") return "Queued";
    if (status === "running") return `${Math.round(progress * 100)}%`;
    if (status === "done") return "Done";
    return "Failed";
  };

  return (
    <Show when={exportJobs().length > 0}>
      <aside
        aria-label="Playlist exports"
        class="fixed bottom-4 right-4 z-50 w-72 max-w-[calc(100vw-2rem)] border-4 border-[#0a0a0a] bg-[#f0ede8] p-3 shadow-[6px_6px_0_#0a0a0a]"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <span class="text-[0.65rem] font-black uppercase tracking-widest">
            {activeExportCount() > 0
              ? `Exporting (${activeExportCount()})`
              : "Exports"}
          </span>
          <button
            type="button"
            onClick={clearFinishedExports}
            class="text-[0.6rem] font-black uppercase tracking-widest transition hover:underline"
          >
            Clear
          </button>
        </div>
        <div class="max-h-64 overflow-y-auto">
          <For each={exportJobs()}>
            {(job) => (
              <div class="mb-2 last:mb-0">
                <p class="truncate text-[0.65rem] font-bold uppercase tracking-wide">
                  {job.name}
                </p>
                <div class="mt-1 h-2 border-[2px] border-[#0a0a0a]">
                  <div
                    class={`h-full origin-left ${
                      job.status === "error" ? "bg-red-600" : "bg-[#1DB954]"
                    }`}
                    style={`width:${Math.round(job.progress * 100)}%`}
                  />
                </div>
                <p class="mt-0.5 text-[0.55rem] uppercase tracking-widest text-[#5c5c5c]">
                  {label(job.status, job.progress)}
                </p>
              </div>
            )}
          </For>
        </div>
      </aside>
    </Show>
  );
}
