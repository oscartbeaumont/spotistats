import { makePersisted } from "@solid-primitives/storage";
import { createSignal } from "solid-js";
import { isServer } from "solid-js/web";

const storage = !isServer ? localStorage : undefined;

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

export const [authStore, setAuthStore] = makePersisted(
  createSignal<AuthStore>({ status: "empty" }),
  {
    name: "auth",
    storage,
  },
);
