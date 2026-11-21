import { Effect } from "effect";
import { HttpClientError, HttpClientRequest } from "effect/http";
import { HttpApiError } from "effect/http-api";
import { expect, it } from "vitest";

import { UpstreamError } from "~/api";

import { runApi } from "./api";
import { authStore, setAuthStore } from "./storage";

it("does not let an old worker API request log out a new session", async () => {
  setAuthStore({ status: "authenticated", accessToken: "Bearer old", linkToUri: false });
  let reject!: () => void;

  const request = runApi(Effect.tryPromise({
    try: () => new Promise<never>((_resolve, fail) => { reject = () => fail(new Error()); }),
    catch: () => new HttpApiError.Unauthorized({}),
  }));

  const result = expect(request).rejects.toThrow("401 Unauthorized");
  setAuthStore({ status: "authenticated", accessToken: "Bearer new", linkToUri: false });
  reject();
  await result;
  expect(authStore()).toMatchObject({ status: "authenticated", accessToken: "Bearer new" });
});

it("clears the rejected worker API session", async () => {
  setAuthStore({ status: "authenticated", accessToken: "Bearer token", linkToUri: false });
  await expect(runApi(Effect.fail(new HttpApiError.Unauthorized({})))).rejects.toThrow("401 Unauthorized");
  expect(authStore()).toEqual({ status: "empty" });
});

/** The shape a dropped fetch arrives as: `HttpClientError`/`TransportError`. */
const droppedConnection = () =>
  new HttpClientError.HttpClientError({
    reason: new HttpClientError.TransportError({
      request: HttpClientRequest.get("http://localhost/api/account/stats"),
    }),
  });

it("retries a dropped connection instead of failing the page", async () => {
  setAuthStore({ status: "authenticated", accessToken: "Bearer token", linkToUri: false });
  let attempts = 0;

  const result = await runApi(
    Effect.gen(function* () {
      attempts += 1;

      if (attempts < 2) return yield* droppedConnection();

      return "ok";
    }),
  );

  expect(result).toBe("ok");
  expect(attempts).toBe(2);
});

it("does not retry a failure the server answered", async () => {
  setAuthStore({ status: "authenticated", accessToken: "Bearer token", linkToUri: false });
  let attempts = 0;
  await expect(
    runApi(
      Effect.gen(function* () {
        attempts += 1;

        // The client's retry filter has to cope with untagged failures too.
        // oxlint-disable-next-line effecttsgo/global-error-in-effect-failure -- the test asserts untagged errors still reach the caller
        return yield* Effect.fail(new Error("UpstreamError"));
      }),
    ),
  ).rejects.toThrow("UpstreamError");
  expect(attempts).toBe(1);
});

/** The tagged error the worker's 502 decodes into, with Spotify's own status. */
const upstreamFailure = (status: number) =>
  new UpstreamError({
    service: "spotify",
    message: `Spotify API failed: ${status}`,
    status,
  });

it("retries a transient upstream failure instead of failing the page", async () => {
  setAuthStore({ status: "authenticated", accessToken: "Bearer token", linkToUri: false });
  let attempts = 0;

  const result = await runApi(
    Effect.gen(function* () {
      attempts += 1;

      if (attempts < 2) return yield* upstreamFailure(503);

      return "ok";
    }),
  );

  expect(result).toBe("ok");
  expect(attempts).toBe(2);
});

it("does not retry an upstream rejection", async () => {
  setAuthStore({ status: "authenticated", accessToken: "Bearer token", linkToUri: false });
  let attempts = 0;

  const failure = runApi(
    Effect.gen(function* () {
      attempts += 1;

      return yield* upstreamFailure(400);
    }),
  );

  await expect(failure).rejects.toBeInstanceOf(UpstreamError);
  await expect(failure).rejects.toMatchObject({ status: 400 });
  expect(attempts).toBe(1);
});
