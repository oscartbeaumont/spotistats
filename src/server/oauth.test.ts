import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createState,
  spotifyErrorReason,
  statsCallback,
  statsLogin,
  stateIsValid,
} from "./oauth";
import { Spotify, type SpotifyShape } from "./spotify";
import { Tracking, type TrackingShape } from "./tracking";

// `./oauth` reaches the worker env through `./spotify`; the client id builds
// the authorize URL and the secret signs the OAuth state.
vi.mock("cloudflare:workers", () => ({
  env: {
    VITE_SPOTIFY_CLIENT_ID: "test-client-id",
    SPOTIFY_CLIENT_SECRET: "test-client-secret",
  },
}));

const login = (url: string) => statsLogin(new Request(url));
const locationOf = (response: Response) => response.headers.get("Location") ?? "";
const stateOf = (response: Response) =>
  new URL(locationOf(response)).searchParams.get("state") ?? "";

afterEach(() => {
  vi.useRealTimers();
});

it("bounces to the canonical origin before it starts the handshake", async () => {
  const response = await login("https://spotistats.otbeaumont.me/account/stats/login");
  expect(response.status).toBe(302);
  expect(locationOf(response)).toBe(
    "https://spotistats.otbeaumont.me/account/stats/login?resumed=1",
  );
  expect(response.headers.get("Set-Cookie")).toBeNull();
});

it("normalises localhost to the registered development host", async () => {
  const response = await login("http://localhost:5173/account/stats/login");
  expect(locationOf(response)).toBe(
    "http://127.0.0.1:5173/account/stats/login?resumed=1",
  );
});

it("sends the user to Spotify with a signed state and no cookie", async () => {
  const response = await login(
    "https://spotistats.otbeaumont.me/account/stats/login?resumed=1",
  );
  const location = locationOf(response);
  expect(location.startsWith("https://accounts.spotify.com/authorize?")).toBe(true);
  expect(new URL(location).searchParams.get("redirect_uri")).toBe(
    "https://spotistats.otbeaumont.me/account/stats/callback",
  );
  // Safari dropped the old state cookie before the callback. The state must
  // carry its own proof so the handshake needs no browser storage.
  expect(response.headers.get("Set-Cookie")).toBeNull();
  const state = stateOf(response);
  expect(state.split(".")).toHaveLength(3);
  expect(await stateIsValid(state)).toBe(true);
});

it("does not bounce a resumed request again", async () => {
  const response = await login(
    "https://spotistats.otbeaumont.me/account/stats/login?resumed=1",
  );
  expect(locationOf(response)).not.toContain("/account/stats/login");
});

it("rejects a state signed with a different secret", async () => {
  const state = await createState();
  const [nonce, issuedAt] = state.split(".");
  const forged = `${nonce}.${issuedAt}.${"0".repeat(64)}`;
  expect(await stateIsValid(forged)).toBe(false);
});

it("rejects a malformed state", async () => {
  expect(await stateIsValid("")).toBe(false);
  expect(await stateIsValid("not-a-state")).toBe(false);
});

it("rejects a state older than the consent window", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T23:00:00Z"));
  const state = await createState();
  vi.setSystemTime(new Date("2026-10-29T23:11:00Z"));
  expect(await stateIsValid(state)).toBe(false);
});

it("maps Spotify's error codes to fixed reasons", () => {
  expect(spotifyErrorReason("access_denied")).toBe("spotify_denied");
  expect(spotifyErrorReason("server_error")).toBe("spotify_unavailable");
  expect(spotifyErrorReason("temporarily_unavailable")).toBe("spotify_unavailable");
  expect(spotifyErrorReason("invalid_scope")).toBe("spotify_rejected");
  // A code Spotify adds later must still be reportable, not read as a cancel.
  expect(spotifyErrorReason("something_new")).toBe("spotify_rejected");
});

describe("stats callback errors", () => {
  const callback = (query: string) =>
    Effect.runPromise(
      statsCallback(
        new Request(
          `https://spotistats.otbeaumont.me/account/stats/callback?${query}`,
        ),
      ).pipe(
        Effect.provide(
          Layer.merge(
            Layer.succeed(Spotify, {} as SpotifyShape),
            Layer.succeed(Tracking, {} as TrackingShape),
          ),
        ),
      ),
    );

  it("treats a cancelled consent screen as a cancellation", async () => {
    const response = await callback("error=access_denied&state=stale");
    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe(
      "/account?stats=failed&reason=spotify_denied",
    );
  });

  it("does not read a Spotify outage as a cancellation", async () => {
    const response = await callback("error=temporarily_unavailable");
    expect(locationOf(response)).toBe(
      "/account?stats=failed&reason=spotify_unavailable",
    );
  });

  it("keeps an unrecognised Spotify error reportable", async () => {
    const response = await callback("error=invalid_scope");
    expect(locationOf(response)).toBe(
      "/account?stats=failed&reason=spotify_rejected",
    );
  });
});
