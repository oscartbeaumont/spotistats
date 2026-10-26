import type { RequestEvent } from "@solidjs/web";
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

/** Headers on `Response` can be immutable; never let that break a request. */
function setHeader(response: Response, name: string, value: string) {
  try {
    response.headers.set(name, value);
  } catch {
    // Immutable response headers are left as they are.
  }
}

function withSecurityHeaders(response: Response): Response {
  setHeader(response, "X-Content-Type-Options", "nosniff");
  setHeader(response, "Referrer-Policy", "strict-origin-when-cross-origin");
  setHeader(response, "X-Frame-Options", "DENY");
  return response;
}

export default async function middleware(
  event: RequestEvent,
  next: () => Promise<Response>,
): Promise<Response> {
  const request = event.request;
  // Vite's preview dispatches relative URLs; production always sends an
  // absolute one. The base keeps both shapes working.
  const pathname = new URL(request.url, "http://localhost").pathname;

  if (pathname === "/account/stats/login") {
    return request.method === "GET"
      ? withSecurityHeaders(statsLogin(request))
      : new Response("Method Not Allowed", { status: 405 });
  }

  if (pathname === "/account/stats/callback") {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const response = await Effect.runPromise(
      statsCallback(request).pipe(Effect.provide(ServicesLive), Effect.orDie),
    );
    return withSecurityHeaders(response);
  }

  if (pathname.startsWith("/api/")) {
    const response = await apiHandler(request);
    setHeader(response, "Cache-Control", "no-store");
    return withSecurityHeaders(response);
  }

  if (isPostHogPath(pathname)) return proxyPostHog(request);

  // Static assets are served before the Worker, so a `/assets/*` request that
  // reaches this point names a file that does not exist. Falling through to the
  // page render answered 200 with HTML: PostHog read `index.html` as a source
  // map, and a missing script looked like a successful download.
  if (pathname.startsWith("/assets/")) {
    return withSecurityHeaders(new Response("Not Found", { status: 404 }));
  }

  return withSecurityHeaders(await next());
}
