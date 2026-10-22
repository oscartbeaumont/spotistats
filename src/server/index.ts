import { Effect } from "effect";
import { handleRequest } from "virtual:solid-ssr-handler";

import { isClientCredentialFailure, reauthMessage } from "~/lib/authorization";

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

/**
 * A Spotify status that will not succeed on retry. 400 is deliberately absent:
 * a rejected *request* is not a rejected *authorization*, and disabling the
 * account over one would demand a reconnect that cannot fix it. Rejections from
 * the token endpoint arrive as `SpotifyAuthRejected` instead.
 */
const permanent = (status: number | null) => status === 401 || status === 403;

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
                // The token endpoint refused the stored authorization, which is
                // the one failure a reconnect fixes. Log it, because a systemic
                // cause (a rotated client secret) hits every account at once.
                SpotifyAuthRejected: (error) =>
                  Effect.gen(function* () {
                    console.error(
                      `Spotify rejected the authorization for ${id}: ${error.message}`,
                    );
                    if (isClientCredentialFailure(error.message)) {
                      // Not the user's problem, so do not make it the user's
                      // job: keep the account enabled and retry once it is fixed.
                      yield* tracking.recordSyncFailure(
                        id,
                        `spotify: ${error.message}`,
                        null,
                      );
                      return;
                    }
                    yield* tracking.requireReauth(id, reauthMessage(error.message));
                  }),
                SpotifyUnauthorized: () =>
                  tracking.requireReauth(id, reauthMessage()),
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
              // A failure while recording the failure must not abort the batch
              // or silently acknowledge a message with no persisted retry.
              (cause) =>
                Effect.sync(() => {
                  console.error(`Spotify sync failed for ${id}`, cause);
                  message.retry();
                }),
            );
          });
        },
        { concurrency: 10 },
      ).pipe(Effect.provide(ServicesLive)),
    );
  },
} satisfies ExportedHandler<Env>;
