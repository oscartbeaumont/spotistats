import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { D1Client } from "@effect/sql-d1";
import { Effect } from "effect";
import { Reactivity } from "effect/reactivity";
import type { SqlClient } from "effect/sql/SqlClient";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readInsights } from "./insights";

let database: DatabaseSync;

const start = Date.UTC(2026, 9, 1, 0, 0);
const end = Date.UTC(2026, 9, 31, 23, 59, 59);
const hour = 3_600_000;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(
    readFileSync(
      new URL("../../migrations/0001_spotify_tracking.sql", import.meta.url),
      "utf8",
    ),
  );
  database
    .prepare(
      "INSERT INTO spotify_tracking_users (spotify_user_id, consented_at, created_at, updated_at) VALUES (?, 0, 0, 0)",
    )
    .run("owner");
});

afterEach(() => database.close());

const addTrack = (id: string, name: string, artist: string, durationMs: number) =>
  database
    .prepare(
      "INSERT INTO spotify_tracks (spotify_track_id, name, artist_names, duration_ms, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, 0)",
    )
    .run(
      id,
      name,
      artist,
      durationMs,
      JSON.stringify({ artists: [{ name: artist }] }),
    );

const addListen = (id: string, trackId: string, playedAtMs: number) =>
  database
    .prepare(
      "INSERT INTO spotify_listens (id, spotify_user_id, spotify_track_id, played_at, played_at_ms, created_at) VALUES (?, 'owner', ?, '', ?, 0)",
    )
    .run(id, trackId, playedAtMs);

const run = <A, E>(query: (sql: SqlClient) => Effect.Effect<A, E>) => {
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
        return yield* query(yield* D1Client.make({ db }));
      }),
    ).pipe(Effect.provide(Reactivity.layer)),
  );
};

const insights = () =>
  run((sql) =>
    readInsights(sql, "owner", {
      tzOffset: 0,
      range: "custom",
      fromMs: start,
      toMs: end,
    }),
  );

describe("readInsights", () => {
  it("aggregates listens, hours, weekdays and streaks in the user's timezone", async () => {
    addTrack("t1", "One", "Artist A", 180_000);
    addTrack("t2", "Two", "Artist B", 240_000);
    addListen("l1", "t1", start + 10 * hour);
    addListen("l2", "t1", start + 23 * hour);
    addListen("l3", "t2", start + 25 * hour); // 02 Oct 01:00
    addListen("l4", "t2", start + 47 * hour + 30 * 60_000); // 02 Oct 23:30
    addListen("l5", "t1", start + 84 * hour); // 04 Oct 12:00

    const data = await insights();

    expect(data.totals).toMatchObject({
      listens: 5,
      tracks: 2,
      artists: 2,
      listeningMs: 3 * 180_000 + 2 * 240_000,
      activeDays: 3,
    });
    expect(data.hours[10]).toBe(1);
    expect(data.hours[23]).toBe(2);
    expect(data.hours[1]).toBe(1);
    expect(data.hours[12]).toBe(1);
    expect(data.weekdays).toEqual([0, 0, 0, 2, 2, 0, 1]);
    expect(data.lateNightListens).toBe(3);
    expect(data.topTracks.map((track) => [track.trackId, track.listens])).toEqual([
      ["t1", 3],
      ["t2", 2],
    ]);
    expect(data.topArtists.map((artist) => [artist.name, artist.listens])).toEqual([
      ["Artist A", 3],
      ["Artist B", 2],
    ]);
    expect(data.onePlayTracks).toBe(0);
    expect(data.streak).toEqual({
      current: 0,
      longest: 2,
      longestEndedOn: "2026-10-02",
    });
    expect(data.busiestDay).toEqual({ date: "2026-10-01", listens: 2 });
    expect(data.trendUnit).toBe("day");
    expect(data.trend).toHaveLength(31);
    expect(
      data.trend.find((bucket) => bucket.bucket === "2026-10-01"),
    ).toMatchObject({ listens: 2, listeningMs: 2 * 180_000 });
  });

  it("scopes the aggregate to the account and the range", async () => {
    database
      .prepare(
        "INSERT INTO spotify_tracking_users (spotify_user_id, consented_at, created_at, updated_at) VALUES (?, 0, 0, 0)",
      )
      .run("other");
    addTrack("t1", "One", "Artist A", 180_000);
    addListen("l1", "t1", start + 10 * hour);
    database
      .prepare(
        "INSERT INTO spotify_listens (id, spotify_user_id, spotify_track_id, played_at, played_at_ms, created_at) VALUES ('foreign', 'other', 't1', '', ?, 0)",
      )
      .run(start + 10 * hour);
    addListen("outside", "t1", end + 24 * hour);

    const data = await insights();
    expect(data.totals.listens).toBe(1);
    expect(data.totals.firstPlayedAtMs).toBe(start + 10 * hour);
  });
});
