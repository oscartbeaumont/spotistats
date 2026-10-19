import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";

import { UpstreamError } from "../api";
import type { TrackingShape } from "./tracking";
import worker from "./index";

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

afterEach(() => vi.restoreAllMocks());

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
