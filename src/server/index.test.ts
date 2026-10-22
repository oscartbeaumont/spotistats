import { Effect } from "effect";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { UpstreamError } from "../api";
import type { TrackingShape } from "./tracking";
import worker from "./index";
import { SpotifyAuthRejected } from "./spotify";

// `./spotify` reads the worker env to build its Basic auth header; these tests
// only need its error classes, so an empty env is enough.
vi.mock("cloudflare:workers", () => ({ env: {} }));

const service = vi.hoisted(() => ({
  sync: vi.fn(),
  recordSyncFailure: vi.fn(),
  requireReauth: vi.fn(),
}));

vi.mock("virtual:solid-ssr-handler", () => ({ handleRequest: vi.fn() }));
vi.mock("./tracking", async () => {
  const { Context } = await import("effect");
  class Tracking extends Context.Service<Tracking, TrackingShape>()("test/Tracking") {}
  return { Tracking };
});
vi.mock("./handler", async () => {
  const { Layer } = await import("effect");
  const { Tracking } = await import("./tracking");
  return { ServicesLive: Layer.succeed(Tracking, service as unknown as TrackingShape) };
});

beforeEach(() => {
  service.sync.mockReset();
  service.recordSyncFailure.mockReset();
  service.requireReauth.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const queue = (spotifyUserId: string) => {
  const message = { body: { spotifyUserId }, retry: vi.fn() };
  return worker
    .queue({ messages: [message] } as unknown as MessageBatch<unknown>)
    .then(() => message);
};

it("retries only the message whose failure cannot be persisted", async () => {
  const error = new UpstreamError({ service: "database", message: "D1 unavailable", status: null });
  service.sync.mockImplementation((id: string) => id === "failed" ? Effect.fail(error) : Effect.void);
  service.recordSyncFailure.mockReturnValue(Effect.fail(error));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const failed = { body: { spotifyUserId: "failed" }, retry: vi.fn() };
  const successful = { body: { spotifyUserId: "successful" }, retry: vi.fn() };
  await worker.queue({ messages: [failed, successful] } as unknown as MessageBatch<unknown>);
  expect(failed.retry).toHaveBeenCalledOnce();
  expect(successful.retry).not.toHaveBeenCalled();
  expect(service.sync).toHaveBeenCalledWith("successful");
});

it("leaves a persisted transient failure to the cron retry schedule", async () => {
  service.sync.mockReturnValue(Effect.fail(new UpstreamError({ service: "spotify", message: "Unavailable", status: 503 })));
  service.recordSyncFailure.mockReturnValue(Effect.void);
  const message = { body: { spotifyUserId: "failed" }, retry: vi.fn() };
  await worker.queue({ messages: [message] } as unknown as MessageBatch<unknown>);
  expect(message.retry).not.toHaveBeenCalled();
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
  const message = await queue("expired");
  expect(service.requireReauth).toHaveBeenCalledWith(
    "expired",
    expect.stringContaining("six months"),
  );
  expect(service.recordSyncFailure).not.toHaveBeenCalled();
  expect(message.retry).not.toHaveBeenCalled();
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
  const message = await queue("bad-request");
  expect(service.recordSyncFailure).toHaveBeenCalledWith(
    "bad-request",
    "spotify: Spotify API failed: 400 Invalid timestamp",
    null,
  );
  expect(service.requireReauth).not.toHaveBeenCalled();
  expect(message.retry).not.toHaveBeenCalled();
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
