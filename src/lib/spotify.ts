import { type InfiniteData, queryOptions } from "@tanstack/solid-query";
import posthog from "posthog-js";
import { isServer } from "solid-js/web";
import {
  authStore,
  clearStoredState,
  setAuthStore,
  type ProfileCache,
} from "~/lib/storage";

export const spotifyClientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
export const spotifyScopes = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  "user-read-email",
  "user-read-recently-played",
];

export class SpotifyUnauthenticatedError extends Error {
  constructor() {
    super("Spotistats: 401 Unauthorized");
    this.name = "SpotifyUnauthenticatedError";
  }
}

export class SpotifyApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Spotistats: ${status}`);
    this.name = "SpotifyApiError";
  }
}

export type SpotifyPage<T> = {
  items: T[];
  next: string | null;
  total: number;
  limit: number;
};

export type SpotifyProfile = {
  id: string;
  display_name: string;
  email?: string;
  uri: string;
  external_urls: { spotify: string };
  followers: { total: number };
  images: { url: string }[];
};

export type SpotifyItem = {
  name: string;
  type: "track" | "artist" | "album";
  uri: string;
  external_urls: { spotify: string };
  images?: { url: string }[];
  artists?: { name: string }[];
  album?: { images: { url: string }[] };
};

type SavedAlbumItem = { album: SpotifyItem };

export type Playlist = {
  id?: string;
  name: string;
  public?: boolean;
  collaborative?: boolean;
  owner?: { display_name: string };
  images: { url: string }[];
};

export type TrackingStatus = {
  enabled: boolean;
  consentedAt: number | null;
  disabledAt: number | null;
  lastPlayedAtMs: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  recent: {
    played_at: string;
    played_at_ms: number;
    name: string;
    album_name: string | null;
    artist_names: string | null;
    image_url: string | null;
    external_url: string | null;
  }[];
};

function base64UrlEncode(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(length: number) {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => possible[value % possible.length]).join(
    "",
  );
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

  if (store.status !== "authenticating" || returnedState !== store.stateToken) {
    setAuthStore({ status: "empty" });
    history.replaceState(null, "", window.location.pathname || "/");
    return false;
  }

  const body = new URLSearchParams({
    client_id: spotifyClientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: spotifyRedirectOrigin(window.location.origin),
    code_verifier: store.codeVerifier,
  });

  let res: Response;
  try {
    res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    console.error("Spotify login network error:", error);
    history.replaceState(null, "", "/error");
    return true;
  }

  if (!res.ok) {
    console.error(
      "Spotify login failed:",
      await res.json().catch(() => ({ status: res.status })),
    );
    history.replaceState(null, "", "/error");
    return true;
  }

  const token = (await res.json()) as {
    token_type: string;
    access_token: string;
  };
  setAuthStore({
    status: "authenticated",
    accessToken: `${token.token_type} ${token.access_token}`,
    linkToUri: false,
  });
  history.replaceState(null, "", window.location.pathname || "/");
  return true;
}

export function hasSpotifyCallbackCode() {
  return new URLSearchParams(window.location.search).has("code");
}

function statusDescription(status: number) {
  if (status === 400)
    return "This is probably being caused by either a bug in the application or a recent change to the Spotify API.";
  if (status === 403)
    return "This is probably being caused by a mismatch between the used endpoints and authorized scopes with the Spotify API.";
  if (status === 404)
    return "This is probably being caused by an out of date cache or bug in the application which resulted in Spotify being unable to find a resource.";
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

export async function spotifyFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const store = authStore();
  if (store.status !== "authenticated") throw new SpotifyUnauthenticatedError();

  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: {
        Authorization: store.accessToken,
        ...(options?.headers ?? {}),
      },
    });

    if ([200, 201, 202, 204, 304].includes(res.status)) {
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }

    if (res.status === 401) {
      setAuthStore({ status: "empty" });
      throw new SpotifyUnauthenticatedError();
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "1") + 1;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return spotifyFetch<T>(url, options);
    }

    if ([400, 403, 404, 500, 502, 503].includes(res.status)) {
      const body = await res.json().catch(() => ({ status: res.status }));
      console.error(statusTitle(res.status), statusDescription(res.status), body);
      throw new SpotifyApiError(res.status, body);
    }

    console.error("Spotify returned unknown status:", res.status);
    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof SpotifyUnauthenticatedError) throw error;
    if (error instanceof SpotifyApiError) throw error;

    console.error("Spotify API network request failed:", {
      url,
      error: String(error),
      online: navigator.onLine,
    });
    throw new Error("Spotistats: Spotify API network request failed");
  }
}

export const profileQueryOptions = queryOptions({
  queryKey: ["spotify", "profile"],
  enabled: !isServer && authStore().status === "authenticated",
  queryFn: async () => {
      const store = authStore();
      const data = await spotifyFetch<SpotifyProfile>(
        "https://api.spotify.com/v1/me",
      );
      posthog.identify(data.id, {
        username: data.display_name,
        email: data.email,
      });
      const next = {
        icon: data.images[0]?.url,
        url: store.status === "authenticated" && store.linkToUri
          ? data.uri
          : data.external_urls.spotify,
        displayName: data.display_name,
        email: data.email,
        followers: data.followers.total,
      } satisfies ProfileCache;
      setAuthStore((current) =>
        current.status === "authenticated" ? { ...current, profile: next } : current,
      );
      return next;
    },
});

export function favouritesQueryOptions(
  kind: "tracks" | "albums",
  range: "long" | "medium" | "short",
  enabled = true,
) {
  const timeRange = `${range}_term` as "long_term" | "medium_term" | "short_term";
  return {
    queryKey: ["spotify", "favourites", kind, range],
    enabled: !isServer && authStore().status === "authenticated" && enabled,
    initialPageParam: kind === "tracks"
      ? `https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=${timeRange}`
      : "https://api.spotify.com/v1/me/albums?limit=50",
    placeholderData: (previous: InfiniteData<SpotifyPage<SpotifyItem>, string> | undefined) => previous,
    queryFn: async ({ pageParam }: { pageParam: string }) => {
      if (kind === "tracks") return spotifyFetch<SpotifyPage<SpotifyItem>>(pageParam as string);
      const data = await spotifyFetch<SpotifyPage<SavedAlbumItem>>(pageParam as string);
      return { ...data, items: data.items.map((item) => item.album) } satisfies SpotifyPage<SpotifyItem>;
    },
    getNextPageParam: (lastPage: SpotifyPage<SpotifyItem>) => lastPage.next || undefined,
  };
}

export const playlistsQueryOptions = queryOptions({
    queryKey: ["spotify", "playlists"],
    enabled: !isServer && authStore().status === "authenticated",
    queryFn: async () => {
      let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";
      let value: Playlist[] = [];
      while (url) {
        const data: SpotifyPage<Playlist> = await spotifyFetch(url);
        value = value.concat(data.items);
        url = data.next;
      }
      return [{ name: "Liked Songs", public: true, images: [] }, ...value];
    },
});

export const statsStatusQueryOptions = queryOptions({
    queryKey: ["account", "stats"],
    enabled: !isServer && authStore().status === "authenticated",
    refetchInterval: (query) => {
      const data = query.state.data as TrackingStatus | undefined;
      if (data?.enabled && data.recent.length === 0) return 3000;
      return 20000;
    },
    queryFn: async () => {
      const store = authStore();
      if (store.status !== "authenticated") throw new SpotifyUnauthenticatedError();

      const res = await fetch("/api/account/stats", {
        headers: { Authorization: store.accessToken },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({
          error: `Stats status failed: ${res.status}`,
        }))) as { error?: string };
        return {
          enabled: false,
          consentedAt: null,
          disabledAt: null,
          lastPlayedAtMs: null,
          lastSuccessAt: null,
          lastError: body.error ?? `Stats status failed: ${res.status}`,
          recent: [],
        } satisfies TrackingStatus;
      }
      return (await res.json()) as TrackingStatus;
    },
});

export async function resetBrowserState() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
  }

  if ("caches" in window) {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  }

  clearStoredState();
  localStorage.clear();
}
