import { Effect, Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Spotify, SpotifyLive, SpotifyProfile } from "./spotify";

/** The token endpoint only needs credentials to build its Basic auth header. */
const credentials = { clientId: "test-client-id", clientSecret: "test-client-secret" };

const profile = {
  id: "user",
  display_name: null,
  uri: "spotify:user:user",
  external_urls: { spotify: "https://open.spotify.com/user/user" },
  followers: { total: 0 },
};

const fetchProfile = () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const spotify = yield* Spotify;

      return yield* spotify.profile("access-token");
    }).pipe(Effect.provide(SpotifyLive(credentials))),
  );

const fetchRecentlyPlayed = () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const spotify = yield* Spotify;

      return yield* spotify.recentlyPlayed("access-token");
    }).pipe(Effect.provide(SpotifyLive(credentials))),
  );

const refreshToken = () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const spotify = yield* Spotify;

      return yield* spotify.refreshToken("refresh-token");
    }).pipe(Effect.provide(SpotifyLive(credentials))),
  );

afterEach(() => vi.unstubAllGlobals());

describe("Spotify profile decoding", () => {
  // Spotify returns `null` for an account with no email (for example a phone
  // signup), which a plain `Schema.optional(Schema.String)` rejects.
  it("accepts an account with no email", () => {
    const decoded = Schema.decodeUnknownSync(SpotifyProfile)({ ...profile, email: null });
    expect(decoded.email).toBeNull();
  });

  it("accepts a profile that omits the email", () => {
    const decoded = Schema.decodeUnknownSync(SpotifyProfile)(profile);
    expect(decoded.email).toBeUndefined();
  });
});

describe("recently played decoding", () => {
  it("accepts a play that omits its playback context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          items: [
            {
              played_at: "2026-01-01T00:00:00.000Z",
              track: {
                id: "track",
                name: "Track",
                duration_ms: 1000,
                uri: "spotify:track:track",
                album: { name: "Album", images: [] },
                artists: [{ name: "Artist" }],
              },
            },
          ],
        }),
      ),
    );

    const items = await fetchRecentlyPlayed();
    expect(items).toHaveLength(1);
    expect(items[0]?.context).toBeUndefined();
  });
});

describe("token endpoint failures", () => {
  it("treats a token endpoint outage as a transient upstream failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    await expect(refreshToken()).rejects.toMatchObject({
      _tag: "UpstreamError",
      service: "spotify",
      status: 503,
    });
  });

  it("treats a rate limit as transient", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("slow down", {
            status: 429,
            headers: { "Retry-After": "60" },
          }),
      ),
    );
    await expect(refreshToken()).rejects.toMatchObject({
      _tag: "UpstreamError",
      status: 429,
    });
  });

  it("keeps an invalid grant as an authorization rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
    await expect(refreshToken()).rejects.toMatchObject({
      _tag: "SpotifyAuthRejected",
      status: 400,
    });
  });
});

describe("Spotify API retries", () => {  it("waits out a transient 5xx instead of failing the request", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;

        return calls < 3
          ? new Response("unavailable", { status: 503 })
          : Response.json(profile);
      }),
    );

    const decoded = await fetchProfile();

    expect(decoded.id).toBe("user");
    expect(calls).toBe(3);
  });

  it("does not retry a request Spotify rejected", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;

        return new Response("bad request", { status: 400 });
      }),
    );

    await expect(fetchProfile()).rejects.toMatchObject({
      _tag: "UpstreamError",
      status: 400,
    });
    expect(calls).toBe(1);
  });

  it("does not retry a rate limit", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;

        return new Response("slow down", {
          status: 429,
          headers: { "Retry-After": "60" },
        });
      }),
    );

    await expect(fetchProfile()).rejects.toMatchObject({
      _tag: "UpstreamError",
      status: 429,
    });
    expect(calls).toBe(1);
  });
});
