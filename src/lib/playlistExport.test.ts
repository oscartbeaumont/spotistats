import { beforeEach, describe, expect, it, vi } from "vitest";

const spotify = vi.hoisted(() => ({
  getExportTracksPage: vi.fn(),
  getAudioFeatures: vi.fn(),
  getArtists: vi.fn(),
}));

vi.mock("~/client/spotify", () => ({
  getExportTracksPage: spotify.getExportTracksPage,
  getAudioFeatures: spotify.getAudioFeatures,
  getArtists: spotify.getArtists,
  playlistTrack: (entry: { is_local?: boolean; item?: unknown; track?: unknown }) => {
    if (entry.is_local) return null;
    const track = (entry.item ?? entry.track) as
      | { is_local?: boolean }
      | null
      | undefined;
    return track && track.is_local !== true ? track : null;
  },
  // The real helper runs an Effect; the mocked getters already return promises.
  runSpotify: (value: unknown) => value,
}));

import { buildPlaylistCsv } from "./playlistExport";

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
    spotify.getAudioFeatures.mockResolvedValue([audioFeatures]);
    spotify.getArtists.mockResolvedValue([{ id: "a1", genres: ["pop"] }]);
  });

  it("writes a header and one row per track, with genres", async () => {
    spotify.getExportTracksPage.mockResolvedValue(
      page([trackRow("t1", "First Song")]),
    );
    const { csv, trackCount } = await buildPlaylistCsv({ name: "Mix" });
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
    spotify.getExportTracksPage.mockResolvedValue(page([local]));
    const { csv } = await buildPlaylistCsv({ name: "Mix" });
    expect(csv).not.toContain("Local File");
    expect(csv.trim().split("\n")).toHaveLength(1);
  });

  it("reports progress that ends at one", async () => {
    spotify.getExportTracksPage.mockResolvedValue(
      page([trackRow("t1", "First Song")]),
    );
    const seen: number[] = [];
    await buildPlaylistCsv({ name: "Mix" }, (fraction) => seen.push(fraction));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it("caps how many pages it asks Spotify for at once", async () => {
    const pages = 8;
    let inFlight = 0;
    let peak = 0;
    spotify.getExportTracksPage.mockImplementation(async (_playlist, offset: number) => {
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

    const { trackCount } = await buildPlaylistCsv({ name: "Long Mix" });
    expect(trackCount).toBe(pages);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
