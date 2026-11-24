import assert from "node:assert/strict";

const currentWeek = "2026-11-23";
const firstPlayedAtMs = Date.UTC(2026, 8, 7, 18);
const dayListens = [18, 24, 16, 30, 22, 38, 27];
const trackNames = [
  "Neon Hours",
  "Paper Satellites",
  "Soft Static",
  "Afterimage",
  "Night Bus Home",
];
const artistNames = [
  "Low Season",
  "Paper Satellites",
  "Mira Vale",
  "Soft Static",
  "Northbound",
];

let syncEnabled = true;

function weekInsights(weekStart) {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  const isPartial = weekStart === currentWeek;
  const days = isPartial ? 2 : 7;
  const listens = dayListens.slice(0, days).reduce((total, value) => total + value, 0);
  const listeningMs = listens * 213_000;
  const hours = Array.from({ length: 24 }, (_, hour) =>
    hour >= 7 && hour <= 23 ? Math.max(1, Math.round(listens / 17)) : 0,
  );
  hours[9] += 12;
  hours[22] += 8;

  return {
    weekStart,
    weekEnd: new Date(start + 6 * 86_400_000).toISOString().slice(0, 10),
    isPartial,
    insights: {
      generatedAt: Date.now(),
      totals: {
        listens,
        tracks: 86,
        artists: 42,
        listeningMs,
        activeDays: days,
        firstPlayedAtMs: start + 8 * 3_600_000,
        lastPlayedAtMs: start + (days - 1) * 86_400_000 + 23 * 3_600_000,
      },
      streak: { current: 3, longest: 5, longestEndedOn: "2026-11-15" },
      hours,
      weekdays: isPartial ? [0, 42, 0, 0, 0, 0, 0] : [18, 24, 16, 30, 22, 38, 27],
      trend: dayListens.slice(0, days).map((count, index) => ({
        bucket: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
        listens: count,
        listeningMs: count * 213_000,
      })),
      trendUnit: "day",
      topTracks: trackNames.map((name, index) => ({
        trackId: `demo-track-${index}`,
        name,
        artistNames: artistNames[index],
        imageUrl: null,
        externalUrl: "https://open.spotify.com/",
        listens: 12 - index * 2,
      })),
      topArtists: artistNames.map((name, index) => ({
        name,
        listens: 18 - index * 2,
        tracks: 5 - index,
      })),
      onePlayTracks: 14,
      lateNightListens: 21,
      busiestDay: isPartial
        ? { date: "2026-11-24", listens: 24 }
        : { date: "2026-11-21", listens: 38 },
    },
  };
}

const observedWeeks = [
  "2026-11-23",
  "2026-11-16",
  "2026-11-09",
  "2026-11-02",
  "2026-10-26",
  "2026-10-19",
  "2026-10-12",
  "2026-10-05",
  "2026-09-28",
  "2026-09-21",
  "2026-09-14",
  "2026-09-07",
];

export default {
  title: "Weekly listening stats",
  baseUrl: "http://127.0.0.1:5173",
  steps: [
    {
      name: "setup authenticated demo API",
      run: async (page) => {
        syncEnabled = true;
        await page.goto("/login");
        await page.evaluate(() => {
          localStorage.setItem(
            "auth",
            JSON.stringify({
              status: "authenticated",
              accessToken: "cdp-demo-token",
              linkToUri: false,
              profile: {
                id: "cdp-demo",
                displayName: "Demo listener",
                email: "demo@example.com",
              },
            }),
          );

          const original = globalThis.document.startViewTransition?.bind(globalThis.document);
          if (original) {
            globalThis.document.startViewTransition = (options) => {
              const state = globalThis;
              state.__weeklyTransitions ??= [];
              if (typeof options === "object" && options !== null) {
                state.__weeklyTransitions.push(...(options.types ?? []));
              }
              return original(options);
            };
          }
        });

        await page.addInitScript(() => {
          const original = globalThis.document.startViewTransition?.bind(globalThis.document);
          if (!original) return;

          globalThis.document.startViewTransition = (options) => {
            const state = globalThis;
            state.__weeklyTransitions ??= [];
            if (typeof options === "object" && options !== null) {
              state.__weeklyTransitions.push(...(options.types ?? []));
            }
            return original(options);
          };
        });

        await page.route(/\/api\/account\/stats\/weeks\/access$/, (route) =>
          route.fulfill({
            json: { enabled: syncEnabled, firstPlayedAtMs },
          }),
        );
        await page.route(/\/api\/account\/stats\/weeks\/[0-9-]+(?:\?|$)/, (route) => {
          if (!syncEnabled) {
            return route.fulfill({ status: 403, json: { _tag: "Forbidden" } });
          }
          const week = new URL(route.request().url()).pathname.split("/").at(-1);
          return route.fulfill({ json: weekInsights(week) });
        });
        await page.route(/\/api\/account\/stats\/weeks\?/, (route) => {
          if (!syncEnabled) {
            return route.fulfill({ status: 403, json: { _tag: "Forbidden" } });
          }
          const before = new URL(route.request().url()).searchParams.get("before");
          const weeks = observedWeeks.filter((week) => before === null || week < before);
          return route.fulfill({
            json: {
              weeks: weeks.slice(0, 12).map((weekStart) => ({
                weekStart,
                listens: 175 - observedWeeks.indexOf(weekStart) * 4,
                tracks: 86,
                listeningMs: (175 - observedWeeks.indexOf(weekStart) * 4) * 213_000,
                activeDays: weekStart === currentWeek ? 2 : 7,
              })),
              hasMore: weeks.length > 12,
            },
          });
        });
      },
    },
    {
      name: "enabled sync shows the weekly view and nav link",
      run: async (page) => {
        await page.goto("/stats/weeks?week=2026-11-16");
        await page.getByRole("heading", { name: "Weekly listening" }).waitFor();
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
        assert.equal(await page.getByRole("link", { name: /Weekly/ }).count(), 1);
        assert.match(await page.locator("main").innerText(), /complete week/i);
      },
    },
    {
      name: "historical week shows the full insights payload",
      note: "Headline totals, hourly and daily charts, top artists and tracks are populated for the selected Monday–Sunday week.",
      run: async (page) => {
        assert.match(await page.locator("main").innerText(), /most played tracks/i);
        assert.match(await page.locator("main").innerText(), /neon hours/i);
        assert.equal(await page.locator("input[type=date]").inputValue(), "2026-11-16");
        await page.getByRole("heading", { name: /most played tracks/i }).scrollIntoViewIfNeeded();
      },
    },
    {
      name: "previous week navigates with a backward view transition",
      note: "The instrumented View Transition API recorded the week-backward type before the new week snapshot appeared.",
      run: async (page) => {
        await page.getByRole("button", { name: "← Previous week" }).click();
        await page.waitForFunction(() =>
          document.documentElement.matches(":active-view-transition-type(week-backward)"),
        );
        const animationName = await page.evaluate(() =>
          getComputedStyle(
            document.documentElement,
            "::view-transition-new(weekly-week)",
          ).animationName,
        );
        assert.equal(animationName, "week-backward-in");
        await page.waitForURL("**/stats/weeks?week=2026-11-09");
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
        const types = await page.evaluate(() => window.__weeklyTransitions ?? []);
        assert.ok(types.includes("week-backward"));
        assert.equal(await page.locator("input[type=date]").inputValue(), "2026-11-09");
      },
    },
    {
      name: "observed-week shortcut selects another historical week",
      run: async (page) => {
        await page.getByRole("button", { name: /16 Nov/ }).click();
        await page.waitForURL("**/stats/weeks?week=2026-11-16");
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
        const types = await page.evaluate(() => window.__weeklyTransitions ?? []);
        assert.ok(types.includes("week-forward"));
      },
    },
    {
      name: "current week is clearly marked as in progress",
      run: async (page) => {
        await page.getByRole("button", { name: "This week" }).click();
        await page.waitForURL(`**/stats/weeks?week=${currentWeek}`);
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
        assert.match(await page.locator("main").innerText(), /week in progress/i);
        assert.equal(await page.getByRole("button", { name: "Next week →" }).isDisabled(), true);
      },
    },
    {
      name: "mobile week controls and insights reflow",
      run: async (page) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/stats/weeks?week=2026-11-16");
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
        assert.equal(await page.getByRole("button", { name: "← Previous week" }).isVisible(), true);
        assert.equal(await page.getByRole("button", { name: "Next week →" }).isVisible(), true);
      },
    },
    {
      name: "reduced motion updates the week without a transition",
      run: async (page) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/stats/weeks?week=2026-11-16");
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
        const before = await page.evaluate(() => window.__weeklyTransitions ?? []);
        await page.getByRole("button", { name: "← Previous week" }).click();
        await page.waitForURL("**/stats/weeks?week=2026-11-09");
        const after = await page.evaluate(() => window.__weeklyTransitions ?? []);
        assert.deepEqual(after, before);
      },
    },
    {
      name: "disabled sync blocks the direct URL and hides the nav link",
      run: async (page) => {
        syncEnabled = false;
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.goto("/stats/weeks?week=2026-11-16");
        await page.getByRole("heading", { name: "NOT FOUND" }).waitFor();
        assert.equal(await page.getByRole("link", { name: /Weekly/ }).count(), 0);
      },
    },
  ],
};
