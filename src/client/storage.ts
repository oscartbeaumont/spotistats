import { Schema } from "effect";
import { createSignal } from "solid-js";

/** Persisted Spotify session, validated on read. */

const ProfileCache = Schema.Struct({
  icon: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  displayName: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  followers: Schema.optional(Schema.Number),
});
export type ProfileCache = typeof ProfileCache.Type;

export const AuthStore = Schema.Union([
  Schema.Struct({ status: Schema.Literal("empty") }),
  Schema.Struct({
    status: Schema.Literal("authenticating"),
    stateToken: Schema.String,
    codeVerifier: Schema.String,
    linkToUri: Schema.Boolean,
  }),
  Schema.Struct({
    status: Schema.Literal("authenticated"),
    accessToken: Schema.String,
    linkToUri: Schema.Boolean,
    profile: Schema.optional(ProfileCache),
  }),
]);
export type AuthStore = typeof AuthStore.Type;

const storageKey = "auth";
const empty: AuthStore = { status: "empty" };

const readAuth = (): AuthStore => {
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return empty;
    return Schema.decodeUnknownSync(AuthStore)(JSON.parse(raw));
  } catch {
    return empty;
  }
};

const [authStore, setAuthSignal] = createSignal<AuthStore>(empty);

/** Whether the client has loaded the persisted session yet. */
const [authReady, setAuthReady] = createSignal(false);

export { authReady };

/**
 * Loads the persisted session.
 *
 * The server has no `localStorage`, so both sides start empty to keep the
 * first client render identical to the server render. `bootstrapClient` calls
 * this on the client after hydration.
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
