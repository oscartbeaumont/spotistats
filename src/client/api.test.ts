import { Effect } from "effect";
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
