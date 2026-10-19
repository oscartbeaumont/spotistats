import { createSignal, untrack } from "solid-js";

import { authStore, setAuthStore, type AuthStore } from "./storage";
import { spotifyClientId, spotifyScopes } from "./spotify";

/** Browser PKCE login and callback handling for the user session token. */

/**
 * The most recent login failure, shown on the sign-in page. A failed token
 * exchange used to silently bounce the user back to an unexplained login
 * screen, so every failure branch records a human-readable reason here.
 */
const [loginError, setLoginError] = createSignal<string | null>(null);
export { loginError };

const base64UrlEncode = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const randomString = (length: number) => {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => possible[value % possible.length]).join("");
};

const createPkceChallenge = async (verifier: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(digest);
};

const spotifyRedirectOrigin = (origin: string) => {
  const url = new URL(origin);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
};

const isSpotifyToken = (
  value: unknown,
): value is { token_type: string; access_token: string } =>
  typeof value === "object" &&
  value !== null &&
  "token_type" in value &&
  typeof value.token_type === "string" &&
  value.token_type.length > 0 &&
  "access_token" in value &&
  typeof value.access_token === "string" &&
  value.access_token.length > 0;

export async function createLoginUrl(origin: string) {
  const token = crypto.randomUUID();
  const verifier = randomString(96);
  const redirectOrigin = spotifyRedirectOrigin(origin);
  setLoginError(null);
  setAuthStore({
    status: "authenticating",
    stateToken: token,
    codeVerifier: verifier,
    linkToUri: false,
  });

  const params = new URLSearchParams({
    client_id: spotifyClientId,
    response_type: "code",
    redirect_uri: redirectOrigin,
    state: token,
    scope: spotifyScopes.join(" "),
    code_challenge_method: "S256",
    code_challenge: await createPkceChallenge(verifier),
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export function hasSpotifyCallbackCode() {
  return new URLSearchParams(window.location.search).has("code");
}

export async function consumeSpotifyCallback(
  store: AuthStore = untrack(() => authStore()),
) {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");

  if (!code) return false;

  const cleanUrl = () => history.replaceState(null, "", window.location.pathname || "/");

  if (store.status !== "authenticating" || returnedState !== store.stateToken) {
    setLoginError("Your sign-in session expired. Please try again.");
    setAuthStore({ status: "empty" });
    cleanUrl();
    return false;
  }

  const body = new URLSearchParams({
    client_id: spotifyClientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: spotifyRedirectOrigin(window.location.origin),
    code_verifier: store.codeVerifier,
  });

  let response: Response;
  try {
    response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    console.error("Spotify login network error:", error);
    setLoginError("Could not reach Spotify. Check your connection and try again.");
    setAuthStore({ status: "empty" });
    cleanUrl();
    return true;
  }

  if (!response.ok) {
    console.error(
      "Spotify login failed:",
      await response.json().catch(() => ({ status: response.status })),
    );
    setLoginError("Spotify rejected the sign-in. Please try again.");
    setAuthStore({ status: "empty" });
    cleanUrl();
    return true;
  }

  let token: { token_type: string; access_token: string };
  try {
    const value: unknown = await response.json();
    if (!isSpotifyToken(value)) {
      throw new Error("Spotify returned an invalid token response");
    }
    token = value;
  } catch (error) {
    console.error("Spotify login response error:", error);
    setLoginError("Spotify returned an unexpected sign-in response. Please try again.");
    setAuthStore({ status: "empty" });
    cleanUrl();
    return true;
  }

  setLoginError(null);
  setAuthStore({
    status: "authenticated",
    accessToken: `${token.token_type} ${token.access_token}`,
    linkToUri: false,
  });
  cleanUrl();
  return true;
}

export function logout() {
  setAuthStore({ status: "empty" });
}
