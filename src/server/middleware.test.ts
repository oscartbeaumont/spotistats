import { describe, expect, it, vi } from "vitest";

import { createMiddleware } from "./middleware-core";

const statsLogin = vi.fn(async () => new Response(null, { status: 302 }));

const statsCallback = vi.fn(async () => new Response(null, { status: 302 }));

const apiHandler = vi.fn(async () => new Response("{}", { status: 200 }));

const proxyPostHog = vi.fn(async () => new Response("posthog"));

const middleware = createMiddleware({
  statsLogin,
  statsCallback,
  apiHandler,
  isPostHogPath: () => false,
  proxyPostHog,
});

const call = (path: string, method = "GET") => {
  const next = vi.fn(
    async () =>
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
  );

  const event = {
    request: new Request(`https://spotistats.otbeaumont.me${path}`, { method }),
  };

  return middleware(event, next).then((response) => ({ response, next }));
};

describe("static asset paths", () => {
  // Static assets are served before the Worker, so anything reaching the
  // middleware under `/assets/` is missing. The page render used to answer 200
  // with HTML, which PostHog then read as a source map.
  it("answers a missing asset with 404 instead of the app shell", async () => {
    const { response, next } = await call("/assets/spotify-abc.js.map");
    expect(response.status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("still renders a page route", async () => {
    const { response, next } = await call("/favourites/albums");
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("method guards", () => {
  it("rejects a non-GET login without dropping the security headers", async () => {
    const { response } = await call("/account/stats/login", "POST");
    expect(response.status).toBe(405);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("rejects a non-GET callback without dropping the security headers", async () => {
    const { response } = await call("/account/stats/callback", "POST");
    expect(response.status).toBe(405);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
