import { Effect, Predicate, Schedule, Schema } from "effect";
import { layer as fetchHttpClientLayer } from "effect/http/FetchHttpClient";
import { HttpApiClient } from "effect/http-api";
import { untrack } from "solid-js";

import { Api } from "~/api";
import type { InsightsQuery } from "~/api";

import { SpotifyUnauthenticatedError } from "./spotify";
import { authStore, setAuthStore } from "./storage";

/**
 * The type-safe client for the Spotistats worker, generated from the shared
 * `Api` definition. Success and error types come straight from the server.
 */

const baseUrl =
  globalThis.location !== undefined
    ? globalThis.location.origin
    : "http://localhost";

const client = Effect.runSync(
  HttpApiClient.make(Api, { baseUrl }).pipe(Effect.provide(fetchHttpClientLayer)),
);

/**
 * A dropped or interrupted connection is a transport failure, not an answer.
 * Safari reports it as `TypeError: Load failed`, which the client wraps as an
 * `HttpClientError` with a `TransportError` reason. A single dropped fetch used
 * to reach the error boundary and blank the page, so retry it a few times
 * before treating it as final. Retrying is safe here: the account routes are
 * reads or idempotent writes, and the worker is one origin away.
 */
const transient = <E>(error: E): boolean => {
  if (
    Predicate.hasProperty(error, "reason") &&
    Predicate.isTagged(error.reason, "TransportError")
  ) {
    return true;
  }

  return (
    Predicate.isTagged(error, "UpstreamError") &&
    Predicate.hasProperty(error, "status") &&
    Schema.is(Schema.Finite)(error.status) &&
    error.status >= 500
  );
};

export const runApi = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> => {
  const session = untrack(() => authStore());

  return Effect.runPromise(
    effect.pipe(
      Effect.retry({
        schedule: Schedule.exponential("250 millis"),
        times: 3,
        while: transient,
      }),
    ),
  ).catch((error: unknown) => {
    if (Predicate.isTagged(error, "Unauthorized")) {
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
  discoveryHistory: () => runApi(client.account.discoveryHistory({ headers: { authorization: authorization() } })),
  discoveryKnown: (ids: readonly string[]) => runApi(client.account.discoveryKnown({ headers: { authorization: authorization() }, payload: { ids } })),
  status: () => runApi(client.account.status({ headers: { authorization: authorization() } })),
  insights: (query: InsightsQuery) =>
    runApi(
      client.account.insights({
        headers: { authorization: authorization() },
        query: {
          tzOffset: query.tzOffset,
          range: query.range,
          fromMs: query.fromMs ?? undefined,
          toMs: query.toMs ?? undefined,
        },
      }),
    ),
  exportJson: () =>
    runApi(client.account.exportJson({ headers: { authorization: authorization() } })),
  exportCsv: () =>
    runApi(client.account.exportCsv({ headers: { authorization: authorization() } })),
  refresh: () =>
    runApi(client.account.refresh({ headers: { authorization: authorization() } })),
  disable: () =>
    runApi(client.account.disable({ headers: { authorization: authorization() } })),
  deleteData: () =>
    runApi(client.account.deleteData({ headers: { authorization: authorization() } })),
};
