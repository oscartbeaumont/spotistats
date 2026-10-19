import { Effect, Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authStore, setAuthStore } from "./storage";
import { getExportTracksPage, getProfile, isLikedSongs, PlaylistTrack, runSpotify } from "./spotify";

vi.mock("./storage", () => {
  let store: unknown;
  return {
    authStore: () => store,
    setAuthStore: vi.fn((next) => {
      store = typeof next === "function" ? next(store) : next;
    }),
  };
});

afterEach(() => vi.unstubAllGlobals());

describe("playlist entry decoding", () => {
  const track = {
    id: "track", is_local: false, name: "Track",
    album: { name: "Album", release_date: "2020" },
    artists: [{ id: "artist", name: "Artist" }], duration_ms: 1000,
  };

  it("accepts null metadata on old playlists", () => {
    const entry = { added_at: null, added_by: null, track };
    expect(Schema.decodeUnknownSync(PlaylistTrack)(entry)).toEqual(entry);
  });

  it("accepts removed tracks so the exporter can skip them", () => {
    const entry = { added_at: "2020-01-01", track: null };
    expect(Schema.decodeUnknownSync(PlaylistTrack)(entry)).toEqual(entry);
  });

  it("accepts local artists without a Spotify ID before filtering local tracks", () => {
    const entry = {
      added_at: "2020-01-01",
      track: { ...track, id: null, is_local: true, artists: [{ id: null, name: "Local" }] },
    };
    expect(Schema.decodeUnknownSync(PlaylistTrack)(entry)).toEqual(entry);
  });
});

describe("Spotify authentication races", () => {
  it("does not log out a newer session when an old request returns 401", async () => {
    setAuthStore({ status: "authenticated", accessToken: "Bearer old", linkToUri: false });
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const request = Effect.runPromiseExit(getProfile());
    setAuthStore({ status: "authenticated", accessToken: "Bearer new", linkToUri: false });
    resolve(new Response(null, { status: 401 }));
    await request;
    expect(authStore()).toMatchObject({ status: "authenticated", accessToken: "Bearer new" });
  });

  it("still logs out the session whose token Spotify rejected", async () => {
    setAuthStore({ status: "authenticated", accessToken: "Bearer old", linkToUri: false });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    await expect(runSpotify(getProfile())).rejects.toThrow();
    expect(authStore()).toEqual({ status: "empty" });
  });
});

describe("export playlist identity", () => {
  it("exports a real playlist named Liked Songs, not the user's library", async () => {
    setAuthStore({ status: "authenticated", accessToken: "Bearer token", linkToUri: false });
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ items: [], next: null, total: 0, limit: 100, offset: 0 }));
    vi.stubGlobal("fetch", fetch);
    await runSpotify(getExportTracksPage({ id: "playlist-id", name: "Liked Songs" }, 100));
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.spotify.com/v1/playlists/playlist-id/tracks?limit=100&offset=100");
  });

  it("recognizes the synthetic library entry but not a malformed null-ID playlist", () => {
    expect(isLikedSongs({ name: "Liked Songs" })).toBe(true);
    expect(isLikedSongs({ name: "Liked Songs", id: null })).toBe(false);
  });
});
