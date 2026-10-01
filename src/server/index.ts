import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

import { Api } from "~/api";

import { AccountGroupLive } from "./api";
import { DatabaseLive } from "./db";
import { statsCallback, statsLogin } from "./oauth";
import { SpotifyLive } from "./spotify";
import { Tracking, TrackingLive } from "./tracking";

/**
 * The worker entry point.
 *
 * `/api/*` is served by the shared Effect `HttpApi`; the stats OAuth redirect
 * routes are plain fetch handlers. Everything else is a static asset or the
 * SPA fallback, which the Cloudflare runtime serves before this worker runs.
 */

const PlatformLive = Layer.merge(DatabaseLive, SpotifyLive);
const ServicesLive = Layer.mergeAll(
  PlatformLive,
  TrackingLive.pipe(Layer.provide(PlatformLive)),
);

const AppLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provideMerge(AccountGroupLive),
  Layer.provideMerge(ServicesLive),
  Layer.provideMerge(HttpServer.layerServices),
);

const { handler } = HttpRouter.toWebHandler(AppLive, { disableLogger: false });

const spotifyUserId = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) return null;
  if (!("spotifyUserId" in body)) return null;
  const value = body.spotifyUserId;
  return typeof value === "string" ? value : null;
};

export default {
  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    if (pathname === "/account/stats/login") return statsLogin(request);

    if (pathname === "/account/stats/callback") {
      return Effect.runPromise(
        statsCallback(request).pipe(Effect.provide(ServicesLive), Effect.orDie),
      );
    }

    if (pathname.startsWith("/api/")) return handler(request);

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(): Promise<void> {
    await Effect.runPromise(
      Effect.gen(function* () {
        const tracking = yield* Tracking;
        yield* tracking.disableInactive;
        yield* tracking.enqueueDue(100);
      }).pipe(Effect.provide(ServicesLive), Effect.orDie),
    );
  },

  async queue(batch: MessageBatch<unknown>): Promise<void> {
    await Effect.runPromise(
      Effect.forEach(
        batch.messages,
        (message) => {
          const id = spotifyUserId(message.body);
          if (!id) return Effect.void;
          return Effect.gen(function* () {
            const tracking = yield* Tracking;
            yield* tracking.sync(id).pipe(
              Effect.catchTag("SpotifyUnauthorized", () =>
                tracking.recordSyncFailure(
                  id,
                  "Spotify refresh token was rejected",
                  null,
                ),
              ),
              Effect.catchTag("UpstreamError", (error) =>
                tracking.recordSyncFailure(
                  id,
                  `${error.service}: ${error.message}`,
                  error.status === 429 ? 60 : null,
                ),
              ),
            );
          });
        },
        { concurrency: "unbounded" },
      ).pipe(Effect.provide(ServicesLive), Effect.orDie),
    );
  },
} satisfies ExportedHandler<Env>;
