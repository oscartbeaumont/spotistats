import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql/SqlClient";
import { HttpRouter, HttpServer } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Api, type WeeklyAccess } from "~/api";

import { AccountGroupLive } from "./api";
import { Spotify, type SpotifyProfile } from "./spotify";
import { Tracking } from "./tracking";

const profile: SpotifyProfile = {
  id: "owner",
  display_name: "Demo",
  email: "demo@example.com",
  uri: "spotify:user:owner",
  external_urls: { spotify: "https://open.spotify.com/user/owner" },
  followers: { total: 0 },
};

const spotify = {
  profile: vi.fn((_token: string) => Effect.succeed(profile)),
};

const tracking = {
  weeklyAccess: vi.fn(
    (_id: string): Effect.Effect<WeeklyAccess> =>
      Effect.succeed({ enabled: true, firstPlayedAtMs: 1 }),
  ),
  weeklyHistory: vi.fn(() => Effect.succeed({ weeks: [], hasMore: false })),
  weeklyInsights: vi.fn(() => Effect.die("not needed in this test")),
};

const ApiLayer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(AccountGroupLive),
  Layer.provide(
    Layer.mergeAll(
      Layer.mock(Spotify, spotify),
      Layer.mock(Tracking, tracking),
      Layer.succeed(SqlClient, {} as SqlClient),
    ),
  ),
  Layer.provide(HttpServer.layerServices),
);

const { dispose, handler: routedHandler } = HttpRouter.toWebHandler(ApiLayer);
// The generic layer retains service requirements from handlers this test does
// not call. At runtime the weekly handlers resolve only the provided mocks.
const handler = routedHandler as (request: Request) => Promise<Response>;

beforeEach(() => {
  vi.clearAllMocks();
  tracking.weeklyAccess.mockReturnValue(
    Effect.succeed({ enabled: true, firstPlayedAtMs: 1 }),
  );
});

afterAll(() => dispose());

const request = (path: string) =>
  handler(
    new Request(`http://spotistats.test${path}`, {
      headers: { authorization: "Bearer demo-token" },
    }),
  );

describe("weekly stats API gate", () => {
  it("returns 403 for history and detail when sync is disabled", async () => {
    tracking.weeklyAccess.mockReturnValue(
      Effect.succeed({ enabled: false, firstPlayedAtMs: 1 }),
    );

    const history = await request("/api/account/stats/weeks?tzOffset=0");
    const detail = await request(
      "/api/account/stats/weeks/2026-11-16?tzOffset=0",
    );

    expect(history.status).toBe(403);
    expect(detail.status).toBe(403);
    expect(tracking.weeklyHistory).not.toHaveBeenCalled();
    expect(tracking.weeklyInsights).not.toHaveBeenCalled();
  });

  it("keeps the access check side-effect free and serves enabled history", async () => {
    const response = await request("/api/account/stats/weeks?tzOffset=0&limit=12");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ weeks: [], hasMore: false });
    expect(tracking.weeklyAccess).toHaveBeenCalledWith("owner");
    expect(tracking.weeklyHistory).toHaveBeenCalledWith("owner", {
      tzOffset: 0,
      page: 1,
      limit: 12,
    });
  });

  it("serves the static access route before the week parameter route", async () => {
    const response = await request("/api/account/stats/weeks/access");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true, firstPlayedAtMs: 1 });
    expect(tracking.weeklyAccess).toHaveBeenCalledWith("owner");
    expect(tracking.weeklyInsights).not.toHaveBeenCalled();
  });

  it.each(["0", "1.5", "1e308"])(
    "clamps invalid history page %s to the first page",
    async (page) => {
      const response = await request(
        `/api/account/stats/weeks?tzOffset=0&page=${page}`,
      );

      expect(response.status).toBe(200);
      expect(tracking.weeklyHistory).toHaveBeenCalledWith("owner", {
        tzOffset: 0,
        page: 1,
        limit: 12,
      });
    },
  );

  it("rejects invalid and future week bounds", async () => {
    const invalid = await request(
      "/api/account/stats/weeks/2026-11-17?tzOffset=0",
    );
    const future = await request(
      "/api/account/stats/weeks/2999-01-05?tzOffset=0",
    );

    expect(invalid.status).toBe(400);
    expect(future.status).toBe(400);
    expect(tracking.weeklyInsights).not.toHaveBeenCalled();
  });
});
