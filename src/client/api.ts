import { Effect } from "effect";
import { layer as fetchHttpClientLayer } from "effect/http/FetchHttpClient";
import { HttpApiClient } from "effect/http-api";
import { untrack } from "solid-js";

import { Api } from "~/api";

import { SpotifyUnauthenticatedError } from "./spotify";
import { authStore, setAuthStore } from "./storage";

/**
 * The type-safe client for the Spotistats worker, generated from the shared
 * `Api` definition. Success and error types come straight from the server.
 */

const baseUrl =
  typeof globalThis.location !== "undefined"
    ? globalThis.location.origin
    : "http://localhost";

const client = Effect.runSync(
  HttpApiClient.make(Api, { baseUrl }).pipe(Effect.provide(fetchHttpClientLayer)),
);

export const runApi = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> => {
  const session = untrack(() => authStore());
  return Effect.runPromise(effect).catch((error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "_tag" in error &&
      error._tag === "Unauthorized"
    ) {
      setAuthStore((current) =>
        session.status === "authenticated" &&
        current.status === "authenticated" &&
        current.accessToken === session.accessToken
          ? { status: "empty" }
          : current,
      );
      throw new SpotifyUnauthenticatedError();
    }
    throw error;
  });
};

const authorization = () => {
  const store = untrack(() => authStore());
  if (store.status !== "authenticated") throw new SpotifyUnauthenticatedError();
  return store.accessToken;
};

export const accountApi = {
  status: () => runApi(client.account.status({ headers: { authorization: authorization() } })),
  refresh: () =>
    runApi(client.account.refresh({ headers: { authorization: authorization() } })),
  disable: () =>
    runApi(client.account.disable({ headers: { authorization: authorization() } })),
  deleteData: () =>
    runApi(client.account.deleteData({ headers: { authorization: authorization() } })),
};
