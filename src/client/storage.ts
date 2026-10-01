import { createSignal } from "solid-js";

export type ProfileCache = {
  icon?: string;
  url?: string;
  displayName?: string;
  email?: string;
  followers?: number;
};

type EmptyAuthStore = { status: "empty" };

type AuthenticatingAuthStore = {
  status: "authenticating";
  stateToken: string;
  codeVerifier: string;
  linkToUri: boolean;
};

type AuthenticatedAuthStore = {
  status: "authenticated";
  accessToken: string;
  linkToUri: boolean;
  profile?: ProfileCache;
};

export type AuthStore =
  | EmptyAuthStore
  | AuthenticatingAuthStore
  | AuthenticatedAuthStore;

const storageKey = "auth";

const readAuth = (): AuthStore => {
  if (typeof localStorage === "undefined") return { status: "empty" };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { status: "empty" };
    const parsed = JSON.parse(raw) as AuthStore;
    return parsed.status ? parsed : { status: "empty" };
  } catch {
    return { status: "empty" };
  }
};

const [authStore, setAuthSignal] = createSignal<AuthStore>({
  status: "empty",
});

/** Whether the client has loaded the persisted session yet. */
const [authReady, setAuthReady] = createSignal(false);

export { authReady };

/**
 * Loads the persisted session.
 *
 * The server has no `localStorage`, so both sides start empty to keep the
 * first client render identical to the server render. `App` calls this on the
 * client after hydration.
 */
export function hydrateAuthStore() {
  setAuthSignal(readAuth());
  setAuthReady(true);
}

const persist = (value: AuthStore) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked; the in-memory signal still works.
  }
};

export { authStore };

export function setAuthStore(next: AuthStore | ((prev: AuthStore) => AuthStore)) {
  setAuthSignal((prev) => {
    const value = typeof next === "function" ? next(prev) : next;
    persist(value);
    return value;
  });
}
