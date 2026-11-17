import { Effect } from "effect";

import { ServicesLive, apiHandler, statsOAuthConfig } from "./handler";
import { createMiddleware } from "./middleware-core";
import { statsCallback, statsLogin } from "./oauth";
import { isPostHogPath, proxyPostHog } from "./posthog";

/**
 * Start-mode middleware.
 *
 * This wires the real routes into `createMiddleware`; the middleware itself is
 * kept in `middleware-core` so it does not import the worker runtime.
 */
export default createMiddleware({
  statsLogin: (request) => statsLogin(request, statsOAuthConfig),
  statsCallback: (request) =>
    Effect.runPromise(
      statsCallback(request, statsOAuthConfig).pipe(
        Effect.provide(ServicesLive),
        Effect.orDie,
      ),
    ),
  apiHandler,
  isPostHogPath,
  proxyPostHog,
});
