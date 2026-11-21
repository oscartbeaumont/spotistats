import { Effect, Layer } from "effect";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { UpstreamError } from "../api";
import { SpotifyAuthRejected, type SpotifyUnauthorized } from "./spotify";
import { Tracking } from "./tracking";
import { createWorker } from "./worker";

type SyncFailure = UpstreamError | SpotifyAuthRejected | SpotifyUnauthorized;

const service = {
  sync: vi.fn((_spotifyUserId: string): Effect.Effect<void, SyncFailure> => Effect.void),
  recordSyncFailure: vi.fn(
    (
      _spotifyUserId: string,
      _message: string,
      _retryAfterSeconds: number | null,
    ): Effect.Effect<void, UpstreamError> => Effect.void,
  ),
  requireReauth: vi.fn(
    (_spotifyUserId: string, _message: string): Effect.Effect<void, UpstreamError> =>
      Effect.void,
  ),
};

const worker = createWorker({
  services: Layer.mock(Tracking, service),
  handleRequest: async () => new Response(null, { status: 204 }),
});

beforeEach(() => {
  service.sync.mockReset();
  service.recordSyncFailure.mockReset();
  service.requireReauth.mockReset();
  service.sync.mockReturnValue(Effect.void);
});

afterEach(() => vi.restoreAllMocks());

/** One queue message, with the retry hook the worker reports through. */
const message = (spotifyUserId: string): Message => ({
  id: spotifyUserId,
  timestamp: new Date(0),
  body: { spotifyUserId },
  attempts: 1,
  retry: vi.fn(),
  ack: vi.fn(),
});

const batchOf = (...messages: readonly Message[]): MessageBatch => ({
  messages,
  queue: "spotistats",
  metadata: {
    metrics: { backlogCount: messages.length, backlogBytes: 0 },
  },
  retryAll: vi.fn(),
  ackAll: vi.fn(),
});

const queue = (spotifyUserId: string) => {
  const queued = message(spotifyUserId);

  return worker.queue(batchOf(queued)).then(() => queued);
};

it("retries only the message whose failure cannot be persisted", async () => {
  const error = new UpstreamError({ service: "database", message: "D1 unavailable", status: null });
  service.sync.mockImplementation((id: string) => id === "failed" ? Effect.fail(error) : Effect.void);
  service.recordSyncFailure.mockReturnValue(Effect.fail(error));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const failed = message("failed");
  const successful = message("successful");
  await worker.queue(batchOf(failed, successful));
  expect(failed.retry).toHaveBeenCalledOnce();
  expect(successful.retry).not.toHaveBeenCalled();
  expect(service.sync).toHaveBeenCalledWith("successful");
});

it("leaves a persisted transient failure to the cron retry schedule", async () => {
  service.sync.mockReturnValue(Effect.fail(new UpstreamError({ service: "spotify", message: "Unavailable", status: 503 })));
  service.recordSyncFailure.mockReturnValue(Effect.void);
  const queued = message("failed");
  await worker.queue(batchOf(queued));
  expect(queued.retry).not.toHaveBeenCalled();
  expect(service.recordSyncFailure).toHaveBeenCalledWith("failed", "spotify: Unavailable", null);
});

it("asks for a reconnect when Spotify expires the stored authorization", async () => {
  service.sync.mockReturnValue(
    Effect.fail(
      new SpotifyAuthRejected({
        message: 'Spotify token request failed: {"error":"invalid_grant"}',
        status: 400,
      }),
    ),
  );
  service.requireReauth.mockReturnValue(Effect.void);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const queued = await queue("expired");
  expect(service.requireReauth).toHaveBeenCalledWith(
    "expired",
    expect.stringContaining("six months"),
  );
  expect(service.recordSyncFailure).not.toHaveBeenCalled();
  expect(queued.retry).not.toHaveBeenCalled();
});

it("keeps retrying rejected requests instead of disabling the account", async () => {
  // A 400 from the recently-played API is a bad request, not a dead
  // authorization, so it must not cost the user a reconnect.
  service.sync.mockReturnValue(
    Effect.fail(
      new UpstreamError({
        service: "spotify",
        message: "Spotify API failed: 400 Invalid timestamp",
        status: 400,
      }),
    ),
  );
  service.recordSyncFailure.mockReturnValue(Effect.void);
  const queued = await queue("bad-request");
  expect(service.recordSyncFailure).toHaveBeenCalledWith(
    "bad-request",
    "spotify: Spotify API failed: 400 Invalid timestamp",
    null,
  );
  expect(service.requireReauth).not.toHaveBeenCalled();
  expect(queued.retry).not.toHaveBeenCalled();
});

it("keeps the account enabled when the app's own credentials are rejected", async () => {
  service.sync.mockReturnValue(
    Effect.fail(
      new SpotifyAuthRejected({
        message: 'Spotify token request failed: {"error":"invalid_client"}',
        status: 400,
      }),
    ),
  );
  service.recordSyncFailure.mockReturnValue(Effect.void);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await queue("misconfigured");
  expect(service.recordSyncFailure).toHaveBeenCalledWith(
    "misconfigured",
    'spotify: Spotify token request failed: {"error":"invalid_client"}',
    null,
  );
  expect(service.requireReauth).not.toHaveBeenCalled();
});
