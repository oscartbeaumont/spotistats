import { describe, expect, it } from "vitest";

import { matchesMood, selectDiscoveryTracks, type DiscoveryCandidate } from "./discovery";

const track = (id: string, source: "new" | "rediscover" = "new", artistKey = id): DiscoveryCandidate => ({
  id, source, artistKey, name: id, artistNames: artistKey, imageUrl: null,
  externalUrl: `https://open.spotify.com/track/${id}`, reason: "test",
});

describe("discovery selection", () => {
  it("alternates new and rediscovered music, preserving the source rankings", () => {
    expect(selectDiscoveryTracks([track("a"), track("b")], [track("c", "rediscover")], "blend").map((item) => item.id))
      .toEqual(["a", "c", "b"]);
  });

  it("deduplicates and caps each primary artist at three tracks", () => {
    const fresh = [track("a", "new", "same"), track("a"), track("b", "new", "same"), track("c", "new", "same"), track("d", "new", "same"), track("e")];
    expect(selectDiscoveryTracks(fresh, [], "new").map((item) => item.id)).toEqual(["a", "b", "c", "e"]);
  });

  it("does not fill rediscovery with new music and caps playlists at thirty", () => {
    expect(selectDiscoveryTracks([track("a")], [], "rediscover")).toEqual([]);
    expect(selectDiscoveryTracks(Array.from({ length: 100 }, (_, index) => track(String(index))), [], "new")).toHaveLength(30);
  });
});

describe("musical mood filters", () => {
  it("excludes missing features rather than guessing", () => {
    expect(matchesMood("any", null)).toBe(true);
    expect(matchesMood("chill", null)).toBe(false);
    expect(matchesMood("focus", { energy: 0.3 })).toBe(false);
    expect(matchesMood("workout", { energy: Number.NaN, tempo: 120 })).toBe(false);
  });

  it("applies the documented boundaries", () => {
    expect(matchesMood("chill", { energy: 0.45 })).toBe(true);
    expect(matchesMood("chill", { energy: 0.46 })).toBe(false);
    expect(matchesMood("focus", { energy: 0.6, instrumentalness: 0.5 })).toBe(true);
    expect(matchesMood("workout", { energy: 0.7, tempo: 110 })).toBe(true);
    expect(matchesMood("upbeat", { energy: 0.5, valence: 0.65 })).toBe(true);
  });
});
