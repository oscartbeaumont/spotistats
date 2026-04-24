import { makePersisted } from "@solid-primitives/storage";
import { isServer } from "solid-js/web";
import { createSignal } from "solid-js";

const storage = !isServer ? localStorage : undefined;

export const [accessToken, setAccessToken] = makePersisted(createSignal<string | null>(null), {
  name: "auth_access_token",
  storage,
});

export const [stateToken, setStateToken] = makePersisted(createSignal<string | null>(null), {
  name: "auth_state_token",
  storage,
});

export const [codeVerifier, setCodeVerifier] = makePersisted(createSignal<string | null>(null), {
  name: "auth_code_verifier",
  storage,
});

export const [linkToUri, setLinkToUri] = makePersisted(createSignal(false), {
  name: "link_to_uri",
  storage,
});

export const [spotifyError, setSpotifyError] = makePersisted(
  createSignal<{ title: string; description: string; code: string } | null>(null),
  { name: "spotify_error", storage },
);

export const [profileCache, setProfileCache] = makePersisted(
  createSignal<{ icon?: string; url?: string; displayName?: string; email?: string; followers?: number } | null>(null),
  { name: "profile_cache", storage },
);

export const [topItemsCache, setTopItemsCache] = makePersisted(createSignal<Record<string, unknown[]>>({}), {
  name: "top_items_cache",
  storage,
});

export function clearStoredState() {
  setAccessToken(null);
  setStateToken(null);
  setCodeVerifier(null);
  setSpotifyError(null);
  setProfileCache(null);
  setTopItemsCache({});
  setLinkToUri(false);
}
