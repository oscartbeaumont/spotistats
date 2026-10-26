import { Effect, Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authStore, setAuthStore } from "./storage";
import {
  getExportTracksPage,
  getProfile,
  getSavedAlbumsPage,
  isLikedSongs,
  PlaylistTrack,
  runSpotify,
  SpotifyProfile,
} from "./spotify";

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

describe("saved album decoding", () => {
  const album = {
    name: "Album",
    type: "album",
    uri: "spotify:album:album",
    external_urls: { spotify: "https://open.spotify.com/album/album" },
    images: [{ url: "https://i.scdn.co/image/album" }],
    artists: [{ name: "Artist" }],
  };

  const respond = (body: unknown) => {
    setAuthStore({
      status: "authenticated",
      accessToken: "Bearer token",
      linkToUri: false,
    });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
  };

  const page = (items: unknown[], offset = 0, next: string | null = null) => ({
    items,
    next,
    total: items.length,
    limit: 50,
    offset,
  });

  it("keeps a page whose album Spotify no longer returns", async () => {
    respond(page([{ added_at: null, album: null }, { added_at: null, album }]));
    const result = await runSpotify(getSavedAlbumsPage());
    expect(result.items.map((item) => item.name)).toEqual(["Album"]);
  });

  it("skips an album that cannot be rendered instead of failing the page", async () => {
    respond(page([{ added_at: null, album: { name: "Broken" } }, { album }]));
    const result = await runSpotify(getSavedAlbumsPage());
    expect(result.items.map((item) => item.name)).toEqual(["Album"]);
  });

  it("advances by Spotify's items, not by the rows it kept", async () => {
    respond(
      page(
        [{ album: null }],
        50,
        "https://api.spotify.com/v1/me/albums?offset=51",
      ),
    );
    const result = await runSpotify(getSavedAlbumsPage(50));
    expect(result.items).toEqual([]);
    expect(result.nextOffset).toBe(51);
  });

  it("names the endpoint in a shape failure, not a fake status", async () => {
    respond({ items: "not a page" });
    await expect(runSpotify(getSavedAlbumsPage())).rejects.toMatchObject({
      _tag: "SpotifyResponseError",
      message: "Spotistats: unexpected response from /v1/me/albums",
    });
  });

  it("masks ids in the endpoint a shape failure names", async () => {
    respond({ items: "not a page" });
    const playlist = { id: "0123456789abcdefghijkl", name: "Playlist" };
    await expect(
      runSpotify(getExportTracksPage(playlist)),
    ).rejects.toMatchObject({
      message: "Spotistats: unexpected response from /v1/playlists/:id/tracks",
    });
  });
});

describe("profile decoding", () => {
  const profile = {
    id: "user",
    display_name: null,
    uri: "spotify:user:user",
    external_urls: { spotify: "https://open.spotify.com/user/user" },
    followers: { total: 0 },
  };

  it("accepts an account with no email", () => {
    const decoded = Schema.decodeUnknownSync(SpotifyProfile)({ ...profile, email: null });
    expect(decoded.email).toBeNull();
  });

  it("accepts a profile that omits the email", () => {
    const decoded = Schema.decodeUnknownSync(SpotifyProfile)(profile);
    expect(decoded.email).toBeUndefined();
  });
});
