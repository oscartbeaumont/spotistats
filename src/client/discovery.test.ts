import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accountApi } from "./api";
import { generateDiscovery, readDiscoveryDraft, saveDiscoveryPlaylist, writeDiscoveryDraft, type DiscoveryDraft } from "./discovery";
import { authStore, setAuthStore } from "./storage";
import { createPrivatePlaylist, runSpotify, setDiscoveryPlaylistTracks } from "./spotify";

vi.mock("./storage", () => {
  let store: unknown;
  return {
    authStore: () => store,
    setAuthStore: vi.fn((next) => { store = typeof next === "function" ? next(store) : next; }),
  };
});

vi.mock("./api", () => ({ accountApi: { discoveryHistory: vi.fn(), discoveryKnown: vi.fn() } }));

const profile = { id: "owner", display_name: "Owner", uri: "spotify:user:owner", external_urls: { spotify: "https://open.spotify.com/user/owner" }, followers: { total: 0 } };
const catalogTrack = (id: string) => ({
  id, name: id, artists: [{ id: `artist-${id}`, name: id }],
  album: { images: [] }, external_urls: { spotify: `https://open.spotify.com/track/${id}` },
});
const draft = (): DiscoveryDraft => ({
  ownerId: "owner", name: "Test", stage: "review", playlist: null,
  tracks: [{ id: "a", name: "A", artistNames: "Artist", artistKey: "artist", imageUrl: null, externalUrl: "https://open.spotify.com/track/a", reason: "test", source: "new" }],
});

beforeEach(() => {
  vi.clearAllMocks();
  setAuthStore({ status: "authenticated", accessToken: "Bearer token", linkToUri: false });
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("discovery generation", () => {
  it("excludes listened, liked, relinked and unplayable tracks before review", async () => {
    vi.mocked(accountApi.discoveryHistory).mockResolvedValue({ seeds: ["seed"], rediscovery: [] });
    vi.mocked(accountApi.discoveryKnown).mockResolvedValue(["known", "original"]);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/v1/me") return Response.json(profile);
      if (url.pathname.endsWith("/recommendations")) return Response.json({ tracks: [
        catalogTrack("new"), catalogTrack("known"), catalogTrack("liked"),
        { ...catalogTrack("relinked"), linked_from: { id: "original" } },
        { ...catalogTrack("blocked"), is_playable: false },
      ] });
      if (url.pathname.endsWith("/contains")) return Response.json(url.searchParams.get("ids")!.split(",").map((id) => id === "liked"));
      throw new Error(`Unexpected URL ${url.pathname}`);
    }));
    expect((await generateDiscovery("new", "any")).tracks.map((track) => track.id)).toEqual(["new"]);
  });

  it("leaves rediscovery empty without calling restricted recommendation endpoints", async () => {
    vi.mocked(accountApi.discoveryHistory).mockResolvedValue({ seeds: [], rediscovery: [] });
    const fetch = vi.fn(async () => Response.json(profile));
    vi.stubGlobal("fetch", fetch);
    expect((await generateDiscovery("rediscover", "focus")).tracks).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not silently substitute results when recommendations are forbidden", async () => {
    vi.mocked(accountApi.discoveryHistory).mockResolvedValue({ seeds: ["seed"], rediscovery: [] });
    const fetch = vi.fn(async (input: string) => input.endsWith("/me") ? Response.json(profile) : Response.json({}, { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    await expect(generateDiscovery("new", "chill")).rejects.toThrow("403");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses Spotify top tracks when no tracked favourites exist", async () => {
    vi.mocked(accountApi.discoveryHistory).mockResolvedValue({ seeds: [], rediscovery: [] });
    vi.mocked(accountApi.discoveryKnown).mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/v1/me") return Response.json(profile);
      if (url.pathname === "/v1/me/top/tracks") return Response.json({ items: [catalogTrack("seed")], next: null, total: 1, limit: 50, offset: 0 });
      if (url.pathname === "/v1/recommendations") {
        expect(url.searchParams.get("seed_tracks")).toBe("seed");
        expect(url.searchParams.get("max_energy")).toBe("0.45");
        return Response.json({ tracks: [catalogTrack("fresh")] });
      }
      return Response.json([false]);
    }));
    expect((await generateDiscovery("new", "chill")).tracks.map((track) => track.id)).toEqual(["fresh"]);
  });

  it("filters rediscovery by actual audio features, including null entries", async () => {
    vi.mocked(accountApi.discoveryHistory).mockResolvedValue({ seeds: [], rediscovery: ["quiet", "loud", "unknown"].map((id) => ({
      id, name: id, artistNames: id, imageUrl: null, externalUrl: null, listens: 4, lastPlayedAtMs: 0,
    })) });
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/v1/me") return Response.json(profile);
      if (url.pathname === "/v1/audio-features") {
        const feature = { danceability: 0, energy: 0.3, speechiness: 0, acousticness: 0, instrumentalness: 0, liveness: 0, valence: 0, tempo: 0, key: 0, loudness: 0, mode: 0, time_signature: 4 };
        return Response.json({ audio_features: [feature, { ...feature, energy: 0.8 }, null] });
      }
      expect(url.searchParams.get("ids")).toBe("quiet");
      return Response.json({ tracks: [catalogTrack("quiet")] });
    }));
    expect((await generateDiscovery("rediscover", "chill")).tracks.map((track) => track.id)).toEqual(["quiet"]);
  });
});

describe("private playlist writes", () => {
  it("never retries an ambiguous creation, including after a reload", async () => {
    const fetch = vi.fn(async (input: string) => {
      if (input.endsWith("/me")) return Response.json(profile);
      throw new TypeError("Connection lost");
    });
    vi.stubGlobal("fetch", fetch);
    await expect(saveDiscoveryPlaylist(draft(), () => {})).rejects.toThrow();
    const persisted = readDiscoveryDraft()!;
    expect(persisted.stage).toBe("creating");
    await expect(saveDiscoveryPlaylist(persisted, () => {})).rejects.toThrow("may have created");
    expect(fetch.mock.calls.filter(([input]) => input.endsWith("/playlists"))).toHaveLength(1);
  });

  it("retries track replacement on the same playlist without appending or recreating", async () => {
    let attempt = 0;
    const fetch = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/me")) return Response.json(profile);
      if (init?.method === "POST") {
        expect(JSON.parse(init.body as string).public).toBe(false);
        return Response.json({ id: "playlist", external_urls: { spotify: "https://open.spotify.com/playlist/playlist" } });
      }
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(init!.body as string)).toEqual({ uris: ["spotify:track:a"] });
      if (++attempt === 1) throw new TypeError("Connection lost");
      return Response.json({ snapshot_id: "snapshot" });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(saveDiscoveryPlaylist(draft(), () => {})).rejects.toThrow();
    expect(readDiscoveryDraft()!.stage).toBe("filling");
    await saveDiscoveryPlaylist(readDiscoveryDraft()!, () => {});
    expect(readDiscoveryDraft()!.stage).toBe("saved");
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("refuses to save another account's draft", async () => {
    const fetch = vi.fn(async () => Response.json({ ...profile, id: "other" }));
    vi.stubGlobal("fetch", fetch);
    await expect(saveDiscoveryPlaylist(draft(), () => {})).rejects.toThrow("different Spotify account");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a write when the session changes during profile verification", async () => {
    const fetch = vi.fn(async () => {
      setAuthStore({ status: "authenticated", accessToken: "Bearer other", linkToUri: false });
      return Response.json(profile);
    });
    vi.stubGlobal("fetch", fetch);
    await expect(saveDiscoveryPlaylist(draft(), () => {})).rejects.toThrow("session changed");
    expect(authStore()).toMatchObject({ accessToken: "Bearer other" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not create a playlist if recovery storage is unavailable", async () => {
    vi.stubGlobal("sessionStorage", { setItem: () => { throw new Error("Storage blocked"); } });
    const fetch = vi.fn(async () => Response.json(profile));
    vi.stubGlobal("fetch", fetch);
    await expect(saveDiscoveryPlaylist(draft(), () => {})).rejects.toThrow("Storage blocked");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not automatically retry either Spotify write on rate limiting", async () => {
    const fetch = vi.fn(async () => Response.json({}, { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    await expect(runSpotify(createPrivatePlaylist("Test"))).rejects.toThrow();
    await expect(runSpotify(setDiscoveryPlaylistTracks("playlist", ["a"]))).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("validates recovery drafts and ignores corrupt storage", () => {
    writeDiscoveryDraft(draft());
    expect(readDiscoveryDraft()).toEqual(draft());
    sessionStorage.setItem("spotistats-discovery-draft", "{}");
    expect(readDiscoveryDraft()).toBeNull();
  });
});
