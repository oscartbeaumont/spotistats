/**
 * Start-mode middleware, composed from the routes it serves.
 *
 * The routes are passed in so the middleware can be exercised without importing
 * the worker runtime, which reads the Cloudflare bindings.
 */

/** The slice of the request event this middleware reads. */
export interface MiddlewareEvent {
  readonly request: Request;
}

/** The handlers the middleware dispatches to, in route order. */
export interface MiddlewareRoutes {
  statsLogin(request: Request): Promise<Response>;
  statsCallback(request: Request): Promise<Response>;
  apiHandler(request: Request): Promise<Response>;
  isPostHogPath(path: string): boolean;
  proxyPostHog(request: Request): Promise<Response>;
}

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

/**
 * Routes handled here, in order:
 * - `/account/stats/login` and `/account/stats/callback` — the stats OAuth flow.
 * - `/api/*` — the Effect `HttpApi`.
 * - `/ph_ed90f8/*` — the PostHog proxy.
 *
 * Every other request falls through to the page render. Keep this list in
 * step with the routes the app expects the server to own.
 */
export function createMiddleware(routes: MiddlewareRoutes) {
  return async function middleware(
    event: MiddlewareEvent,
    next: () => Promise<Response>,
  ): Promise<Response> {
    const request = event.request;
    // Vite's preview dispatches relative URLs; production always sends an
    // absolute one. The base keeps both shapes working.
    const pathname = new URL(request.url, "http://localhost").pathname;

    if (pathname === "/account/stats/login") {
      return request.method === "GET"
        ? withSecurityHeaders(await routes.statsLogin(request))
        : withSecurityHeaders(new Response("Method Not Allowed", { status: 405 }));
    }

    if (pathname === "/account/stats/callback") {
      if (request.method !== "GET") {
        return withSecurityHeaders(new Response("Method Not Allowed", { status: 405 }));
      }

      const response = await routes.statsCallback(request);

      return withSecurityHeaders(response);
    }

    if (pathname.startsWith("/api/")) {
      const response = await routes.apiHandler(request);
      setHeader(response, "Cache-Control", "no-store");

      return withSecurityHeaders(response);
    }

    if (routes.isPostHogPath(pathname)) return routes.proxyPostHog(request);

    // Static assets are served before the Worker, so a `/assets/*` request that
    // reaches this point names a file that does not exist. Falling through to the
    // page render answered 200 with HTML: PostHog read `index.html` as a source
    // map, and a missing script looked like a successful download.
    if (pathname.startsWith("/assets/")) {
      return withSecurityHeaders(new Response("Not Found", { status: 404 }));
    }

    return withSecurityHeaders(await next());
  };
}
