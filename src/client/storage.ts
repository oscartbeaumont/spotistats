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

const [authStore, setAuthSignal] = createSignal<AuthStore>(readAuth());

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
