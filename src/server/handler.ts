import { env } from "cloudflare:workers";
import { Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

import { Api } from "~/api";

import { AccountGroupLive } from "./api";
import { DatabaseLive } from "./db";
import { SpotifyLive } from "./spotify";
import { TrackingLive } from "./tracking";

/**
 * The Effect runtime for the worker.
 *
 * `ServicesLive` provides the database, Spotify and tracking services for the
 * queue and cron handlers. `apiHandler` is the fetch-shaped handler for the
 * shared `HttpApi`. This is the only server module that reads the worker
 * bindings, so the services and their tests take their inputs explicitly.
 */

/** The credentials the OAuth handshake and token endpoint share. */
export const statsOAuthConfig = {
  clientId: env.VITE_SPOTIFY_CLIENT_ID,
  clientSecret: env.SPOTIFY_CLIENT_SECRET,
} as const;

const PlatformLive = Layer.merge(
  DatabaseLive(env.DB),
  SpotifyLive(statsOAuthConfig),
);

export const ServicesLive = Layer.mergeAll(
  PlatformLive,
  TrackingLive(env.SPOTIFY_SYNC_QUEUE).pipe(Layer.provide(PlatformLive)),
);

const AppLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provideMerge(AccountGroupLive),
  Layer.provideMerge(ServicesLive),
  Layer.provideMerge(HttpServer.layerServices),
);

export const apiHandler = HttpRouter.toWebHandler(AppLive, {
  disableLogger: false,
}).handler;
