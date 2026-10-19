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

/**
 * The app used to be reachable from more than one host. The session lives in
 * `localStorage`, which is scoped to an origin, so a browser that signed in on
 * one host looked signed out on the other. Visitors are moved to the host the
 * worker is deployed on so that cannot happen.
 */
const canonicalHost = "spotistats.otbeaumont.me";
const legacyHosts = new Set(["spotistats.js.org", "www.spotistats.js.org"]);

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
  request: Request,
  next: () => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (legacyHosts.has(url.hostname)) {
    const target = new URL(request.url);
    target.protocol = "https:";
    target.hostname = canonicalHost;
    target.port = "";
    return new Response(null, {
      status: 301,
      headers: { Location: target.toString() },
    });
  }

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

  const response = withSecurityHeaders(await next());

  // The document names the hashed chunks for this build, so serving a stale
  // copy after a deploy points the browser at files that no longer exist —
  // which is what "Importing a module script failed." looks like from the
  // outside. Hashed assets stay immutable; the document must not be reused.
  if (response.headers.get("content-type")?.includes("text/html")) {
    setHeader(response, "Cache-Control", "no-store, must-revalidate");
  }

  return response;
}
