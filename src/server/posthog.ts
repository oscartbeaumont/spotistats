/**
 * Proxies requests to PostHog.
 *
 * The path has a random name so ad blockers are less likely to match it. The
 * browser sends analytics here (`api_host: "/ph_ed90f8"`), and this module
 * forwards the request to PostHog's ingestion or assets host.
 */

const pathPrefix = "/ph_ed90f8";

export function isPostHogPath(pathname: string): boolean {
  return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`);
}

export function proxyPostHog(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const hostname = url.pathname.startsWith(`${pathPrefix}/static/`)
    ? "us-assets.i.posthog.com"
    : "us.i.posthog.com";

  const target = new URL(url);
  target.protocol = "https:";
  target.hostname = hostname;
  target.port = "443";
  target.pathname = url.pathname.slice(pathPrefix.length) || "/";

  const headers = new Headers(request.headers);
  headers.set("host", hostname);
  headers.delete("accept-encoding");

  return fetch(target, {
    method: request.method,
    headers,
    body: request.body,
  });
}
