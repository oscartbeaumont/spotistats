import { authStore, setAuthStore } from "./storage";
import { spotifyClientId, spotifyScopes } from "./spotify";

/** Browser PKCE login and callback handling for the user session token. */

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

export async function createLoginUrl(origin: string) {
  const token = Math.random().toString(36).slice(2);
  const verifier = randomString(96);
  const redirectOrigin = spotifyRedirectOrigin(origin);
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

export async function consumeSpotifyCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");
  const store = authStore();

  if (!code) return false;

  const cleanUrl = () => history.replaceState(null, "", window.location.pathname || "/");

  if (store.status !== "authenticating" || returnedState !== store.stateToken) {
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
    cleanUrl();
    return true;
  }

  if (!response.ok) {
    console.error(
      "Spotify login failed:",
      await response.json().catch(() => ({ status: response.status })),
    );
    setAuthStore({ status: "empty" });
    cleanUrl();
    return true;
  }

  const token = (await response.json()) as {
    token_type: string;
    access_token: string;
  };
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
