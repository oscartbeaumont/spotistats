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
 * shared `HttpApi`.
 */

const PlatformLive = Layer.merge(DatabaseLive, SpotifyLive);

export const ServicesLive = Layer.mergeAll(
  PlatformLive,
  TrackingLive.pipe(Layer.provide(PlatformLive)),
);

const AppLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provideMerge(AccountGroupLive),
  Layer.provideMerge(ServicesLive),
  Layer.provideMerge(HttpServer.layerServices),
);

export const apiHandler = HttpRouter.toWebHandler(AppLive, {
  disableLogger: false,
}).handler;
