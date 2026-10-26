import { describe, expect, it, vi } from "vitest";

vi.mock("./handler", () => ({ ServicesLive: {}, apiHandler: vi.fn() }));
vi.mock("./oauth", () => ({ statsLogin: vi.fn(), statsCallback: vi.fn() }));

import middleware from "./middleware";

const call = (path: string) => {
  const next = vi.fn(
    async () =>
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
  );
  const event = {
    request: new Request(`https://spotistats.otbeaumont.me${path}`),
  } as unknown as Parameters<typeof middleware>[0];
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
