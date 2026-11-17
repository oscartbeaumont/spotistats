import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildPlaylistCsv, type PlaylistExportSource } from "./playlistExport";

const source = {
  tracksPage: vi.fn(),
  audioFeatures: vi.fn(),
  artists: vi.fn(),
} satisfies PlaylistExportSource;

const audioFeatures = {
  danceability: 0.5,
  energy: 0.5,
  key: 1,
  loudness: -5,
  mode: 1,
  speechiness: 0.1,
  acousticness: 0.2,
  instrumentalness: 0,
  liveness: 0.1,
  valence: 0.5,
  tempo: 120,
  time_signature: 4,
};

const trackRow = (id: string, name: string) => ({
  added_by: { id: "owner" },
  added_at: "2026-01-01T00:00:00Z",
  track: {
    id,
    is_local: false,
    name,
    album: { name: "Album", release_date: "2026-01-01" },
    artists: [{ id: "a1", name: "Artist" }],
    duration_ms: 200_000,
    popularity: 50,
  },
});

const page = (items: ReturnType<typeof trackRow>[]) => ({
  items,
  next: null,
  total: items.length,
  limit: 100,
  offset: 0,
});

describe("buildPlaylistCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    source.audioFeatures.mockResolvedValue([audioFeatures]);
    source.artists.mockResolvedValue([{ id: "a1", genres: ["pop"] }]);
  });

  it("writes a header and one row per track, with genres", async () => {
    source.tracksPage.mockResolvedValue(page([trackRow("t1", "First Song")]));

    const { csv, trackCount } = await buildPlaylistCsv(
      { name: "Mix" },
      () => {},
      source,
    );

    const [header, row] = csv.trim().split("\n");
    expect(header).toContain("Spotify ID");
    expect(header).toContain("Time Signature");
    expect(row).toContain("t1");
    expect(row).toContain("First Song");
    expect(row).toContain("pop");
    expect(trackCount).toBe(1);
  });

  it("skips local files", async () => {
    const local = trackRow("t2", "Local File");
    local.track.is_local = true;
    source.tracksPage.mockResolvedValue(page([local]));
    const { csv } = await buildPlaylistCsv({ name: "Mix" }, () => {}, source);
    expect(csv).not.toContain("Local File");
    expect(csv.trim().split("\n")).toHaveLength(1);
  });

  it("reports progress that ends at one", async () => {
    source.tracksPage.mockResolvedValue(page([trackRow("t1", "First Song")]));
    const seen: number[] = [];
    await buildPlaylistCsv({ name: "Mix" }, (fraction) => seen.push(fraction), source);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it("caps how many pages it asks Spotify for at once", async () => {
    const pages = 8;
    let inFlight = 0;
    let peak = 0;
    source.tracksPage.mockImplementation(async (_playlist, offset: number) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;

      return {
        items: [trackRow(`t${offset}`, `Track ${offset}`)],
        next: null,
        total: pages * 50,
        limit: 50,
        offset,
      };
    });

    const { trackCount } = await buildPlaylistCsv({ name: "Long Mix" }, () => {}, source);
    expect(trackCount).toBe(pages);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
