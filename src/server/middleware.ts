import { Effect } from "effect";

import { ServicesLive, apiHandler } from "./handler";
import { statsCallback, statsLogin } from "./oauth";
import { isPostHogPath, proxyPostHog } from "./posthog";

/**
 * Start-mode middleware.
 *
 * Routes handled here, in order:
 * - `/account/stats/login` and `/account/stats/callback` — the stats OAuth flow.
 * - `/api/*` — the Effect `HttpApi`.
 * - `/ph_ed90f8/*` — the PostHog proxy.
 *
 * Every other request falls through to the page render. Keep this list in
 * step with the routes the app expects the server to own.
 */
export default async function middleware(
  request: Request,
  next: () => Promise<Response>,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  if (pathname === "/account/stats/login") return statsLogin(request);

  if (pathname === "/account/stats/callback") {
    return Effect.runPromise(
      statsCallback(request).pipe(Effect.provide(ServicesLive), Effect.orDie),
    );
  }

  if (pathname.startsWith("/api/")) return apiHandler(request);

  if (isPostHogPath(pathname)) return proxyPostHog(request);

  return next();
}
