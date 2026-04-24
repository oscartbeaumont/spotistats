import { useNavigate } from "@solidjs/router";
import { accessToken, clearStoredState, codeVerifier, setAccessToken, setCodeVerifier, setSpotifyError, stateToken, setStateToken } from "~/lib/storage";

export const spotifyClientId = "1107a25b98c041bb90c9063553e5f1a8";
export const spotifyScopes = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  "user-read-email",
  "user-read-recently-played",
];

function base64UrlEncode(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(length: number) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, value => possible[value % possible.length]).join("");
}

async function createPkceChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function spotifyRedirectOrigin(origin: string) {
  const url = new URL(origin);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
}

export async function createLoginUrl(origin: string) {
  const token = Math.random().toString(36).slice(2);
  const verifier = randomString(96);
  const redirectOrigin = spotifyRedirectOrigin(origin);
  setStateToken(token);
  setCodeVerifier(verifier);

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

  if (!code) return false;

  if (returnedState !== stateToken() || !codeVerifier()) {
    setStateToken(null);
    setCodeVerifier(null);
    history.replaceState(null, "", window.location.pathname || "/");
    return false;
  }

  const body = new URLSearchParams({
    client_id: spotifyClientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: spotifyRedirectOrigin(window.location.origin),
    code_verifier: codeVerifier() ?? "",
  });

  let res: Response;
  try {
    res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    setSpotifyError({
      title: "Spotify Login Network Error",
      description: "The authorization request to Spotify failed. Please check your connection and try logging in again.",
      code: JSON.stringify({ error: String(error), online: navigator.onLine }, null, 2),
    });
    history.replaceState(null, "", "/error");
    return true;
  }

  if (!res.ok) {
    setSpotifyError({
      title: `${res.status}: Spotify Login Failed`,
      description: "Spotify rejected the authorization code exchange. Please try logging in again.",
      code: JSON.stringify(await res.json().catch(() => ({ status: res.status })), null, 2),
    });
    history.replaceState(null, "", "/error");
    return true;
  }

  const token = await res.json() as { token_type: string; access_token: string };
  setAccessToken(`${token.token_type} ${token.access_token}`);
  setSpotifyError(null);

  setStateToken(null);
  setCodeVerifier(null);
  history.replaceState(null, "", window.location.pathname || "/");
  return true;
}

export function hasSpotifyCallbackCode() {
  return new URLSearchParams(window.location.search).has("code");
}

function statusDescription(status: number) {
  if (status === 400) return "This is probably being caused by either a bug in the application or a recent change to the Spotify API.";
  if (status === 403) return "This is probably being caused by a mismatch between the used endpoints and authorized scopes with the Spotify API.";
  if (status === 404) return "This is probably being caused by an out of date cache or bug in the application which resulted in Spotify being unable to find a resource.";
  return "Spotify had an issue, please try again later.";
}

function statusTitle(status: number) {
  const names: Record<number, string> = {
    400: "Bad Request",
    403: "Forbidden",
    404: "Not Found",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
  };
  return `${status}: ${names[status] ?? "Spotify Error"}`;
}

export function useSpotifyFetch() {
  const navigate = useNavigate();

  return async function spotifyFetch<T>(url: string, options?: RequestInit): Promise<T> {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        ...options,
        headers: {
          Authorization: accessToken() ?? "",
          ...(options?.headers ?? {}),
        },
      });

      if ([200, 201, 202, 204, 304].includes(res.status)) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      if (res.status === 401) {
        setAccessToken(null);
        navigate("/login", { replace: true });
        throw new Error("Spotistats: 401 Unauthorized");
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "1") + 1;
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return spotifyFetch<T>(url, options);
      }

      if ([400, 403, 404, 500, 502, 503].includes(res.status)) {
        const body = await res.json().catch(() => ({ status: res.status }));
        setSpotifyError({
          title: statusTitle(res.status),
          description: statusDescription(res.status),
          code: JSON.stringify(body, null, 2),
        });
        navigate("/error", { replace: true });
        throw new Error(`Spotistats: ${res.status}`);
      }

      console.error("Spotify returned unknown status:", res.status);
      return (await res.json()) as T;
    } catch (error) {
      if (String(error).startsWith("Error: Spotistats:")) throw error;

      setSpotifyError({
        title: "Accessing Spotify API",
        description: "The network request failed, please reload to try again.",
        code: JSON.stringify({ url, error: String(error), online: navigator.onLine }, null, 2),
      });
      navigate("/error", { replace: true });
      throw new Error("Spotistats: Spotify API network request failed");
    }
  };
}

export async function resetBrowserState() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  }

  if ("caches" in window) {
    const keys = await window.caches.keys();
    await Promise.all(keys.map(key => window.caches.delete(key)));
  }

  clearStoredState();
  localStorage.clear();
}
