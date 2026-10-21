import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  buildPlaylistCsv: vi.fn(),
  downloadTextFile: vi.fn(),
}));

vi.mock("~/lib/playlistExport", () => ({
  buildPlaylistCsv: deps.buildPlaylistCsv,
}));
vi.mock("~/lib/download", () => ({
  downloadTextFile: deps.downloadTextFile,
  safeFileName: (name: string) => name,
}));

import {
  clearFinishedExports,
  exportJobs,
  startPlaylistExports,
} from "./exportStore";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("export store", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearFinishedExports();
    await flush();
  });

  it("runs each queued playlist and records a download", async () => {
    deps.buildPlaylistCsv.mockImplementation(
      async (_playlist: unknown, onProgress: (fraction: number) => void) => {
        onProgress(0.5);
        return { csv: "csv", trackCount: 3 };
      },
    );
    startPlaylistExports([{ name: "Morning Mix" }, { name: "Deep Focus" }]);
    await flush();
    await flush();
    const jobs = exportJobs();
    expect(jobs.map((job) => job.status)).toEqual(["done", "done"]);
    expect(deps.downloadTextFile).toHaveBeenCalledTimes(2);
    expect(deps.downloadTextFile).toHaveBeenCalledWith("Morning Mix.csv", "csv");
  });

  it("does not queue the same playlist twice", async () => {
    deps.buildPlaylistCsv.mockResolvedValue({ csv: "csv", trackCount: 3 });
    startPlaylistExports([{ id: "p1", name: "Morning Mix" }]);
    startPlaylistExports([{ id: "p1", name: "Morning Mix" }]);
    await flush();
    await flush();
    expect(exportJobs().filter((job) => job.id === "p1")).toHaveLength(1);
  });

  it("records a failed export", async () => {
    deps.buildPlaylistCsv.mockRejectedValue(new Error("rate limited"));
    startPlaylistExports([{ id: "p1", name: "Morning Mix" }]);
    await flush();
    await flush();
    const [job] = exportJobs();
    expect(job?.status).toBe("error");
    expect(job?.error).toContain("rate limited");
  });

  it("drops finished jobs on clear", async () => {
    deps.buildPlaylistCsv.mockResolvedValue({ csv: "csv", trackCount: 3 });
    startPlaylistExports([{ id: "p1", name: "Morning Mix" }]);
    await flush();
    await flush();
    expect(exportJobs()).toHaveLength(1);
    clearFinishedExports();
    expect(exportJobs()).toHaveLength(0);
  });
});
