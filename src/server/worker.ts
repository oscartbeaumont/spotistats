import { Effect, type Layer, Option, Schema } from "effect";
import type { ConfigError } from "effect/Config";

import { isClientCredentialFailure, reauthMessage } from "~/lib/authorization";

import { Tracking } from "./tracking";

/**
 * The Worker's queue and cron handlers.
 *
 * The page renderer and the service layer are passed in, so the handlers can be
 * tested without loading the Vite virtual modules or the Cloudflare bindings.
 */

/** The body the sync producer sends for one account. */
const SyncMessage = Schema.Struct({ spotifyUserId: Schema.String });

const decodeSyncMessage = Schema.decodeUnknownOption(SyncMessage);

const syncUserId = (message: Message): string | null =>
  Option.getOrNull(
    decodeSyncMessage(message.body).pipe(
      Option.map((body) => body.spotifyUserId),
    ),
  );

/**
 * A Spotify status that will not succeed on retry. 400 is deliberately absent:
 * a rejected *request* is not a rejected *authorization*, and disabling the
 * account over one would demand a reconnect that cannot fix it. Rejections from
 * the token endpoint arrive as `SpotifyAuthRejected` instead.
 */
const permanent = (status: number | null) => status === 401 || status === 403;

export interface WorkerDependencies {
  /** Everything the handlers need; `Tracking` is the service they consume. */
  readonly services: Layer.Layer<Tracking, ConfigError>;
  readonly handleRequest: (request: Request) => Promise<Response>;
}

export function createWorker(dependencies: WorkerDependencies) {
  return {
    async fetch(request: Request): Promise<Response> {
      return dependencies.handleRequest(request);
    },

    async scheduled(): Promise<void> {
      await Effect.runPromise(
        Effect.gen(function* () {
          const tracking = yield* Tracking;
          yield* tracking.disableInactive;
          yield* tracking.enqueueDue(100);
        }).pipe(Effect.provide(dependencies.services), Effect.orDie),
      );
    },

    async queue(batch: MessageBatch<unknown>): Promise<void> {
      await Effect.runPromise(
        Effect.forEach(
          batch.messages,
          (message) => {
            const id = syncUserId(message);

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
        ).pipe(Effect.provide(dependencies.services)),
      );
    },
  } satisfies ExportedHandler<Env>;
}
