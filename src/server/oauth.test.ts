import { expect, it, vi } from "vitest";

import { statsLogin } from "./oauth";

// `./oauth` reaches the worker env through `./spotify`; only the client id is
// needed to build the authorize URL.
vi.mock("cloudflare:workers", () => ({
  env: { VITE_SPOTIFY_CLIENT_ID: "test-client-id" },
}));

const login = (url: string) => statsLogin(new Request(url));
const locationOf = (response: Response) => response.headers.get("Location") ?? "";

it("bounces to the canonical origin before it sets the state cookie", () => {
  const response = login("https://spotistats.otbeaumont.me/account/stats/login");
  expect(response.status).toBe(302);
  expect(locationOf(response)).toBe(
    "https://spotistats.otbeaumont.me/account/stats/login?resumed=1",
  );
  // Minting the state here would scope the cookie to whatever host the browser
  // asked for, which is not always the host Spotify returns to.
  expect(response.headers.get("Set-Cookie")).toBeNull();
});

it("normalises localhost to the registered development host", () => {
  const response = login("http://localhost:5173/account/stats/login");
  expect(locationOf(response)).toBe(
    "http://127.0.0.1:5173/account/stats/login?resumed=1",
  );
});

it("sends the user to Spotify from the canonical origin", () => {
  const response = login(
    "https://spotistats.otbeaumont.me/account/stats/login?resumed=1",
  );
  const location = locationOf(response);
  expect(location.startsWith("https://accounts.spotify.com/authorize?")).toBe(true);
  expect(new URL(location).searchParams.get("redirect_uri")).toBe(
    "https://spotistats.otbeaumont.me/account/stats/callback",
  );
  expect(response.headers.get("Set-Cookie")).toContain("spotify_stats_state=");
});

it("does not bounce a resumed request again", () => {
  const response = login(
    "https://spotistats.otbeaumont.me/account/stats/login?resumed=1",
  );
  expect(locationOf(response)).not.toContain("/account/stats/login");
});
