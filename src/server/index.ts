import { Effect } from "effect";
import { handleRequest } from "virtual:solid-ssr-handler";

import { ServicesLive } from "./handler";
import { Tracking } from "./tracking";

/**
 * The Cloudflare Worker entry.
 *
 * Start mode owns the page render through `virtual:solid-ssr-handler`, which
 * also runs `start.middleware` (the JSON API and the stats OAuth routes). The
 * worker adds the queue consumer and the cron trigger.
 */

const spotifyUserId = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) return null;
  if (!("spotifyUserId" in body)) return null;
  const value = body.spotifyUserId;
  return typeof value === "string" ? value : null;
};

/** A Spotify status that will not succeed on retry. */
const permanent = (status: number | null) =>
  status === 400 || status === 401 || status === 403;

export default {
  async fetch(request: Request): Promise<Response> {
    return handleRequest(request);
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
            yield* Effect.catchCause(
              Effect.catchTags(tracking.sync(id), {
                SpotifyUnauthorized: () =>
                  tracking.requireReauth(
                    id,
                    "Spotify rejected the refresh token. Reconnect Spotify stats.",
                  ),
                UpstreamError: (error) =>
                  permanent(error.status)
                    ? tracking.requireReauth(
                        id,
                        `Spotify rejected the sync (${error.status}). Reconnect Spotify stats.`,
                      )
                    : tracking.recordSyncFailure(
                        id,
                        `${error.service}: ${error.message}`,
                        error.status === 429 ? 60 : null,
                      ),
              }),
              // A failure while recording the failure must not abort the batch.
              (cause) =>
                Effect.sync(() =>
                  console.error(`Spotify sync failed for ${id}`, cause),
                ),
            );
          });
        },
        { concurrency: "unbounded" },
      ).pipe(Effect.provide(ServicesLive)),
    );
  },
} satisfies ExportedHandler<Env>;
