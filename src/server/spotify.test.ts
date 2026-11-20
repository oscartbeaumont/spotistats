import { Effect, Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpstreamError } from "~/api";

import { Spotify, SpotifyAuthRejected, SpotifyLive, SpotifyProfile } from "./spotify";

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

/** Resolves with the failure, after asserting it is the shared upstream error. */
const upstreamFailure = async (request: Promise<unknown>): Promise<UpstreamError> => {
  const failure: unknown = await request.catch((error: UpstreamError) => error);
  expect(failure).toBeInstanceOf(UpstreamError);

  if (!(failure instanceof UpstreamError)) throw failure;

  return failure;
};

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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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
    const failure = await upstreamFailure(refreshToken());
    expect(failure).toMatchObject({ service: "spotify", status: 503 });
  });

  it("treats a long rate limit as transient but does not wait it out", async () => {
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
    const failure = await upstreamFailure(refreshToken());
    expect(failure).toMatchObject({ status: 429, retryAfterMs: 60000 });
  });

  it("retries a short rate limit instead of failing the token request", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;

        return calls === 1
          ? new Response("slow down", { status: 429, headers: { "Retry-After": "0" } })
          : Response.json({
              access_token: "token",
              token_type: "Bearer",
              expires_in: 3600,
              scope: "user-read-email",
            });
      }),
    );

    const token = await refreshToken();
    expect(token.access_token).toBe("token");
    expect(calls).toBe(2);
  });

  it("keeps an invalid grant as an authorization rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );

    const failure: unknown = await refreshToken().catch(
      (error: SpotifyAuthRejected) => error,
    );

    expect(failure).toBeInstanceOf(SpotifyAuthRejected);
    expect(failure).toMatchObject({ status: 400 });
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

    const failure = await upstreamFailure(fetchProfile());
    expect(failure).toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });

  it("waits out a short rate limit instead of failing the request", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;

        return calls === 1
          ? new Response("slow down", { status: 429, headers: { "Retry-After": "0" } })
          : Response.json(profile);
      }),
    );

    const decoded = await fetchProfile();

    expect(decoded.id).toBe("user");
    expect(calls).toBe(2);
  });

  it("waits the exact delay Spotify asks for", async () => {
    // https://github.com/oscartbeaumont/spotistats/issues/81
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;

        return calls === 1
          ? new Response("slow down", { status: 429, headers: { "Retry-After": "1" } })
          : Response.json(profile);
      }),
    );

    const request = fetchProfile();
    let settled = false;
    void request.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    expect((await request).id).toBe("user");
    expect(calls).toBe(2);
  });

  it("does not wait out a rate limit longer than the callback can afford", async () => {
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

    const failure = await upstreamFailure(fetchProfile());
    expect(failure).toMatchObject({ status: 429, retryAfterMs: 60000 });
    expect(calls).toBe(1);
  });
});
