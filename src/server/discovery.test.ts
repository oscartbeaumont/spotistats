import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { D1Client } from "@effect/sql-d1";
import { Effect } from "effect";
import { Reactivity } from "effect/reactivity";
import { afterEach, beforeEach, expect, it } from "vitest";

import { readDiscoveryHistory, readKnownTracks } from "./discovery";

let database: DatabaseSync;
let bindings: number[];
const now = Date.UTC(2026, 9, 22);
const day = 86_400_000;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(readFileSync(new URL("../../migrations/0001_spotify_tracking.sql", import.meta.url), "utf8"));
  for (const id of ["owner", "other"]) database.prepare("INSERT INTO spotify_tracking_users (spotify_user_id, consented_at, created_at, updated_at) VALUES (?, 0, 0, 0)").run(id);
  bindings = [];
});
afterEach(() => database.close());

function listen(user: string, id: string, daysAgo: number) {
  database.prepare("INSERT OR IGNORE INTO spotify_tracks (spotify_track_id, name, updated_at) VALUES (?, ?, 0)").run(id, id);
  database.prepare("INSERT INTO spotify_listens (id, spotify_user_id, spotify_track_id, played_at, played_at_ms, created_at) VALUES (?, ?, ?, '', ?, 0)")
    .run(`${user}:${id}:${daysAgo}`, user, id, now - daysAgo * day);
}

const run = <A, E>(query: (sql: D1Client.D1Client) => Effect.Effect<A, E>) => {
  // Execute the real D1 driver's compiled SQL in SQLite, enforcing D1's bind cap.
  const db = {
    prepare: (text: string) => ({
      bind: (...values: SQLInputValue[]) => ({
        all: async () => {
          bindings.push(values.length);
          if (values.length > 100) throw new Error("D1 binding limit exceeded");
          return { results: database.prepare(text).all(...values) };
        },
      }),
    }),
  } as unknown as D1Client.D1ClientConfig["db"];
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    return yield* query(yield* D1Client.make({ db }));
  })).pipe(Effect.provide(Reactivity.layer)));
};

it("returns only repeated tracks with no play in the last 90 days, scoped to the user", async () => {
  listen("owner", "old", 100);
  listen("owner", "old", 101);
  listen("owner", "recent", 100);
  listen("owner", "recent", 1);
  listen("owner", "once", 200);
  listen("owner", "boundary", 90);
  listen("owner", "boundary", 100);
  listen("other", "foreign", 100);
  listen("other", "foreign", 101);
  const result = await run((sql) => readDiscoveryHistory(sql, "owner", now));
  expect(result.rediscovery.map((track) => track.id)).toEqual(["old"]);
  expect(result.seeds).not.toContain("foreign");
  expect(result.rediscovery[0]).toMatchObject({ listens: 2, lastPlayedAtMs: now - 100 * day });
});

it("bounds seed and rediscovery results", async () => {
  for (let index = 0; index < 110; index++) {
    listen("owner", String(index), 100);
    listen("owner", String(index), 101);
  }
  const result = await run((sql) => readDiscoveryHistory(sql, "owner", now));
  expect(result.seeds).toHaveLength(5);
  expect(result.rediscovery).toHaveLength(100);
});

it("checks all supplied IDs without exceeding the D1 parameter cap or leaking another user's listens", async () => {
  listen("owner", "known", 1);
  listen("owner", "late-batch", 2);
  listen("other", "foreign", 1);
  const ids = ["known", "foreign", ...Array.from({ length: 196 }, (_, index) => String(index)), "late-batch"];
  expect(await run((sql) => readKnownTracks(sql, "owner", ids))).toEqual(["known", "late-batch"]);
  expect(Math.max(...bindings)).toBeLessThanOrEqual(100);
  expect(await run((sql) => readKnownTracks(sql, "owner", []))).toEqual([]);
});
