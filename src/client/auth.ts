import { Schema } from "effect";
import { createSignal, untrack } from "solid-js";

import {
  capture,
  resetAnalytics,
  type LoginFailureReason,
} from "./analytics";
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

/** The token response, decoded at the I/O boundary rather than asserted. */
const SpotifyTokenResponse = Schema.Struct({
  token_type: Schema.NonEmptyString,
  access_token: Schema.NonEmptyString,
  scope: Schema.optional(Schema.String),
});

type SpotifyTokenResponse = typeof SpotifyTokenResponse.Type;

export async function createLoginUrl(origin: string, playlistWrite = false) {
  const token = crypto.randomUUID();
  const verifier = randomString(96);
  const redirectOrigin = spotifyRedirectOrigin(origin);
  setLoginError(null);
  setAuthStore({
    status: "authenticating",
    stateToken: token,
    codeVerifier: verifier,
    linkToUri: false,
    ...(playlistWrite ? { returnTo: "/discover" as const } : {}),
  });

  const params = new URLSearchParams({
    client_id: spotifyClientId,
    response_type: "code",
    redirect_uri: redirectOrigin,
    state: token,
    scope: [...spotifyScopes, ...(playlistWrite ? ["playlist-modify-private"] : [])].join(" "),
    code_challenge_method: "S256",
    code_challenge: await createPkceChallenge(verifier),
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export function hasSpotifyCallbackResult() {
  const params = new URLSearchParams(window.location.search);

  if (params.has("code")) return true;

  // Only a sign-in that was actually started can return an error, so a stray
  // `?error=` on a signed-in page is not a reason to leave the session alone.
  return (
    params.has("error") &&
    untrack(() => authStore()).status === "authenticating"
  );
}

export async function consumeSpotifyCallback(
  store: AuthStore = untrack(() => authStore()),
) {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");
  const spotifyError = params.get("error");

  const cleanUrl = () =>
    history.replaceState(null, "", window.location.pathname || "/");

  if (!code) {
    if (!spotifyError || store.status === "authenticated") return false;
    // Cancelling or failing the consent screen used to land back on the login
    // page with no explanation.
    const denied = spotifyError === "access_denied";
    capture("login_failed", { reason: denied ? "denied" : "unavailable" });
    setLoginError(
      denied
        ? "Spotify did not grant access, so you are not signed in. Try again when you are ready."
        : "Spotify could not complete the sign-in. Try again in a moment.",
    );
    setAuthStore({ status: "empty" });
    cleanUrl();

    return true;
  }

  const failedLogin = (
    reason: LoginFailureReason,
    message: string,
    cause: unknown,
  ) => {
    console.error("Spotify login failed:", cause);
    capture("login_failed", { reason });
    setLoginError(message);
    setAuthStore({ status: "empty" });
    cleanUrl();

    return true;
  };

  if (store.status !== "authenticating" || returnedState !== store.stateToken) {
    capture("login_failed", { reason: "state_mismatch" });
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
    return failedLogin(
      "network_error",
      "Could not reach Spotify. Check your connection and try again.",
      error,
    );
  }

  if (!response.ok) {
    return failedLogin(
      "rejected",
      "Spotify rejected the sign-in. Please try again.",
      await response.json().catch(() => ({ status: response.status })),
    );
  }

  let token: SpotifyTokenResponse;

  try {
    const value: unknown = await response.json();

    token = Schema.decodeUnknownSync(SpotifyTokenResponse)(value);
  } catch (error) {
    return failedLogin(
      "invalid_response",
      "Spotify returned an unexpected sign-in response. Please try again.",
      error,
    );
  }

  setLoginError(null);
  capture("login_succeeded", {});
  setAuthStore({
    status: "authenticated",
    accessToken: `${token.token_type} ${token.access_token}`,
    linkToUri: false,
    scopes: token.scope?.split(" ").filter(Boolean) ?? [],
  });
  cleanUrl();

  if (store.status === "authenticating" && store.returnTo) window.location.replace(store.returnTo);

  return true;
}

export function logout() {
  capture("logout", {});
  resetAnalytics();

  try { sessionStorage.removeItem("spotistats-discovery-draft"); } catch { /* Storage may be blocked. */ }

  setAuthStore({ status: "empty" });
}
