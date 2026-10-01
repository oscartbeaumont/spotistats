import { Effect } from "effect";

import { ServicesLive, apiHandler } from "./handler";
import { statsCallback, statsLogin } from "./oauth";

/**
 * Start-mode middleware.
 *
 * The worker's JSON API and the stats OAuth redirects run here, inside Solid's
 * request scope and in the Workers runtime. Every other request falls through
 * to the page render.
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

  return next();
}
