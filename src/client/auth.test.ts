import { afterEach, expect, it, vi } from "vitest";

import { consumeSpotifyCallback, createLoginUrl } from "./auth";
import { authStore, setAuthStore } from "./storage";

vi.mock("./analytics", () => ({ capture: vi.fn(), resetAnalytics: vi.fn() }));
vi.mock("./storage", () => {
  let store: unknown;
  return { authStore: () => store, setAuthStore: vi.fn((next) => { store = next; }) };
});
afterEach(() => vi.unstubAllGlobals());

it("keeps regular sign-in read-only and requests private playlist scope only on opt-in", async () => {
  const normal = new URL(await createLoginUrl("https://example.com"));
  expect(normal.searchParams.get("scope")).not.toContain("playlist-modify");
  const optedIn = new URL(await createLoginUrl("https://example.com", true));
  expect(optedIn.searchParams.get("scope")).toContain("playlist-modify-private");
  expect(optedIn.searchParams.get("scope")).not.toContain("playlist-modify-public");
  expect(authStore()).toMatchObject({ status: "authenticating", returnTo: "/discover" });
});

it("records actual granted scopes and returns to discovery after a validated callback", async () => {
  const replace = vi.fn();
  vi.stubGlobal("window", { location: { search: "?code=code&state=state", pathname: "/", origin: "https://example.com", replace } });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "token", token_type: "Bearer", scope: "user-top-read playlist-modify-private" })));
  await consumeSpotifyCallback({ status: "authenticating", stateToken: "state", codeVerifier: "verifier", linkToUri: false, returnTo: "/discover" });
  expect(authStore()).toMatchObject({ status: "authenticated", scopes: ["user-top-read", "playlist-modify-private"] });
  expect(replace).toHaveBeenCalledWith("/discover");
});

it("does not assume a requested scope was granted when Spotify omits it", async () => {
  vi.stubGlobal("window", { location: { search: "?code=code&state=state", pathname: "/", origin: "https://example.com" } });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "token", token_type: "Bearer" })));
  setAuthStore({ status: "authenticating", stateToken: "state", codeVerifier: "verifier", linkToUri: false });
  await consumeSpotifyCallback();
  expect(authStore()).toMatchObject({ scopes: [] });
});
