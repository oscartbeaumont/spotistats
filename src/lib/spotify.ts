import { useNavigate } from "@solidjs/router";
import { accessToken, clearStoredState, setAccessToken, setSpotifyError, stateToken, setStateToken } from "~/lib/storage";

export const spotifyClientId = "1107a25b98c041bb90c9063553e5f1a8";
export const spotifyScopes = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  "user-read-recently-played",
];

export function createLoginUrl(origin: string) {
  const token = Math.random().toString(36).slice(2);
  setStateToken(token);

  const params = new URLSearchParams({
    client_id: spotifyClientId,
    response_type: "token",
    redirect_uri: origin,
    state: token,
    scope: spotifyScopes.join(" "),
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export function consumeSpotifyCallbackHash() {
  if (!window.location.hash) return false;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("access_token");
  const type = params.get("token_type");
  const returnedState = params.get("state");

  if (!token || !type) return false;

  if (returnedState === stateToken()) {
    setAccessToken(`${type} ${token}`);
  }

  setStateToken(null);
  history.replaceState(null, "", window.location.pathname || "/");
  return true;
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
        code: JSON.stringify(String(error), null, 2),
      });
      navigate("/error", { replace: true });
      throw error;
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
