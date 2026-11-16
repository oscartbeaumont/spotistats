import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { D1Client } from "@effect/sql-d1";
import { Effect } from "effect";
import { Reactivity } from "effect/reactivity";
import { SqlClient } from "effect/sql/SqlClient";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const queue = vi.hoisted(() => ({
  send: vi.fn(async () => undefined),
  sendBatch: vi.fn(async () => undefined),
}));

vi.mock("cloudflare:workers", () => ({
  env: { SPOTIFY_SYNC_QUEUE: queue },
}));

import { Spotify, type SpotifyShape } from "./spotify";
import { Tracking, TrackingLive, type TrackingShape } from "./tracking";

let database: DatabaseSync;

beforeEach(() => {
  vi.clearAllMocks();
  queue.send.mockClear();
  queue.sendBatch.mockClear();
  database = new DatabaseSync(":memory:");
  for (const file of ["0001_spotify_tracking.sql", "0002_colossal_selene.sql"]) {
    database.exec(
      readFileSync(new URL(`../../migrations/${file}`, import.meta.url), "utf8"),
    );
  }
});

afterEach(() => database.close());

const profile = {
  id: "user",
  display_name: "Listener",
  email: null,
  uri: "spotify:user:user",
  external_urls: { spotify: "https://open.spotify.com/user/user" },
  followers: { total: 0 },
};

const token = {
  access_token: "access",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "refresh",
  scope: "user-read-email user-read-recently-played",
};

const play = (id: string, playedAt: string) => ({
  played_at: playedAt,
  context: { type: "playlist", uri: "spotify:playlist:one" },
  track: {
    id,
    name: `Track ${id}`,
    duration_ms: 180_000,
    uri: `spotify:track:${id}`,
    external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    album: { name: "Album", images: [{ url: "https://i.scdn.co/image/one" }] },
    artists: [{ name: "Artist" }],
  },
});

const spotify = {
  refreshToken: vi.fn(() =>
    Effect.succeed({
      ...token,
      access_token: "new-access",
      refresh_token: "rotated",
    }),
  ),
  recentlyPlayed: vi.fn(() =>
    Effect.succeed([
      play("one", "2026-11-16T10:00:00.000Z"),
      play("two", "2026-11-16T09:00:00.000Z"),
    ]),
  ),
} as unknown as SpotifyShape;

const run = <A, E>(
  query: (tracking: TrackingShape) => Effect.Effect<A, E>,
) => {
  const db = {
    prepare: (text: string) => ({
      bind: (...values: SQLInputValue[]) => ({
        all: async () => {
          if (values.length > 100) throw new Error("D1 binding limit exceeded");
          return { results: database.prepare(text).all(...values) };
        },
      }),
    }),
  } as unknown as D1Client.D1ClientConfig["db"];

  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const sql = yield* D1Client.make({ db });
        return yield* Effect.gen(function* () {
          const tracking = yield* Tracking;
          return yield* query(tracking);
        }).pipe(
          Effect.provide(TrackingLive),
          Effect.provideService(SqlClient, sql),
          Effect.provideService(Spotify, spotify),
        );
      }),
    ).pipe(Effect.provide(Reactivity.layer)),
  );
};

describe("tracking sync", () => {
  it("enables, syncs and reports recent listens", async () => {
    const result = await run((tracking) =>
      Effect.gen(function* () {
        yield* tracking.enable(profile, token);
        yield* tracking.sync("user");
        return yield* tracking.status("user");
      }),
    );

    expect(queue.send).toHaveBeenCalledWith({ spotifyUserId: "user" });
    expect(spotify.refreshToken).toHaveBeenCalledWith("refresh");
    expect(spotify.recentlyPlayed).toHaveBeenCalledWith(
      "new-access",
      undefined,
    );
    expect(result).toMatchObject({
      enabled: true,
      listenCount: 2,
      lastSuccessAt: expect.any(Number),
      lastPlayedAtMs: Date.parse("2026-11-16T10:00:00.000Z"),
      lastError: null,
    });
    expect(result.recent.map((item) => item.name)).toEqual([
      "Track one",
      "Track two",
    ]);
  });

  it("does not sync a disabled account", async () => {
    const result = await run((tracking) =>
      Effect.gen(function* () {
        yield* tracking.enable(profile, token);
        yield* tracking.disable("user");
        yield* tracking.sync("user");
        return yield* tracking.status("user");
      }),
    );
    expect(spotify.refreshToken).not.toHaveBeenCalled();
    expect(result.enabled).toBe(false);
  });

  it("deletes the account and its listens", async () => {
    const result = await run((tracking) =>
      Effect.gen(function* () {
        yield* tracking.enable(profile, token);
        yield* tracking.sync("user");
        yield* tracking.deleteData("user");
        return yield* tracking.status("user");
      }),
    );
    expect(result).toMatchObject({ enabled: false, listenCount: 0, recent: [] });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM spotify_listens").get(),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM spotify_tokens").get(),
    ).toEqual({ count: 0 });
  });

  it("keeps a freshly connected account enabled", async () => {
    const result = await run((tracking) =>
      Effect.gen(function* () {
        yield* tracking.enable(profile, token);
        yield* tracking.disableInactive;
        return yield* tracking.status("user");
      }),
    );
    expect(result.enabled).toBe(true);
  });

  it("disables an account that has not been read for six months", async () => {
    const result = await run((tracking) =>
      Effect.gen(function* () {
        yield* tracking.enable(profile, token);
        database
          .prepare("UPDATE spotify_tracking_users SET last_read_at = ?")
          .run(Date.now() - 200 * 86_400_000);
        yield* tracking.disableInactive;
        return yield* tracking.status("user");
      }),
    );
    expect(result.enabled).toBe(false);
    expect(result.disabledAt).toEqual(expect.any(Number));
  });
});
