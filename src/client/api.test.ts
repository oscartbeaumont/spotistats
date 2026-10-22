import { Effect } from "effect";
import { HttpClientError, HttpClientRequest } from "effect/http";
import { expect, it, vi } from "vitest";

import { runApi } from "./api";
import { authStore, setAuthStore } from "./storage";

vi.mock("~/api", async () => import("../api"));
vi.mock("./storage", () => {
  let store: unknown;
  return {
    authStore: () => store,
    setAuthStore: (next: unknown) => {
      store = typeof next === "function" ? next(store) : next;
    },
  };
});

it("does not let an old worker API request log out a new session", async () => {
  setAuthStore({ status: "authenticated", accessToken: "Bearer old", linkToUri: false });
  let reject!: () => void;
  const request = runApi(Effect.tryPromise({
    try: () => new Promise<never>((_resolve, fail) => { reject = () => fail(new Error()); }),
    catch: () => ({ _tag: "Unauthorized" as const }),
  }));
  const result = expect(request).rejects.toThrow("401 Unauthorized");
  setAuthStore({ status: "authenticated", accessToken: "Bearer new", linkToUri: false });
  reject();
  await result;
  expect(authStore()).toMatchObject({ status: "authenticated", accessToken: "Bearer new" });
});

it("clears the rejected worker API session", async () => {
  setAuthStore({ status: "authenticated", accessToken: "Bearer token", linkToUri: false });
  await expect(runApi(Effect.fail({ _tag: "Unauthorized" as const }))).rejects.toThrow("401 Unauthorized");
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
      if (attempts < 2) return yield* Effect.fail(droppedConnection());
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
        return yield* Effect.fail(new Error("UpstreamError"));
      }),
    ),
  ).rejects.toThrow("UpstreamError");
  expect(attempts).toBe(1);
});
