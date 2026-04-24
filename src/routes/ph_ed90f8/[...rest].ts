// This endpoint proxies requests to PostHog's API.
// It has a random name to make blocking less likely.

import type { APIEvent } from "@solidjs/start/server";

async function handler(e: APIEvent) {
  // Determine target hostname based on static or dynamic ingestion
  const hostname = e.nativeEvent.url.pathname.startsWith("/ph_ed90f8/static/")
    ? "us-assets.i.posthog.com" // change us to eu for EU Cloud
    : "us.i.posthog.com"; // change us to eu for EU Cloud

  // Build external URL
  const url = new URL(e.nativeEvent.url);
  url.protocol = "https:";
  url.hostname = hostname;
  url.port = "443";
  url.pathname = `/${e.params.rest}`;

  const headers = new Headers(e.request.headers);
  headers.set("Accept-Encoding", "");
  headers.set("host", hostname);

  // Proxy the request to the external host
  return await fetch(url.toString(), {
    method: e.request.method,
    headers,
    body: e.request.body,
    // @ts-expect-error: not valid in types but this is a thing
    duplex: "half",
  });
}

export const GET = handler;
export const POST = handler;
