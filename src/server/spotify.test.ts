import { Effect, Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

// `./spotify` reads the worker env to build its Basic auth header; decoding a
// profile never reaches it, so an empty env is enough.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { Spotify, SpotifyLive, SpotifyProfile } from "./spotify";

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
    }).pipe(Effect.provide(SpotifyLive)),
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

describe("Spotify API retries", () => {
  it("waits out a transient 5xx instead of failing the request", async () => {
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
