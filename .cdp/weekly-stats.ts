import assert from "node:assert/strict";

const currentWeek = "2026-11-23";
const firstPlayedAtMs = Date.UTC(2026, 6, 27, 18);
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
let weeklyDetailRequests = 0;
let weeklyHistoryRequests = 0;

export function weekInsights(weekStart) {
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
  "2026-08-31",
  "2026-08-24",
  "2026-08-17",
  "2026-08-10",
  "2026-08-03",
  "2026-07-27",
];

export default {
  title: "Weekly listening stats in the overview",
  baseUrl: "http://127.0.0.1:5173",
  steps: [
    {
      name: "setup authenticated overview API",
      run: async (page) => {
        syncEnabled = true;
        weeklyDetailRequests = 0;
        weeklyHistoryRequests = 0;
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

        await page.route("https://api.spotify.com/v1/me", (route) =>
          route.fulfill({
            json: {
              id: "cdp-demo",
              display_name: "Demo listener",
              email: "demo@example.com",
              uri: "spotify:user:cdp-demo",
              external_urls: { spotify: "https://open.spotify.com/user/cdp-demo" },
              followers: { total: 0 },
              images: [],
            },
          }),
        );
        await page.route("https://api.spotify.com/v1/me/player/currently-playing", (route) =>
          route.fulfill({ status: 204 }),
        );
        await page.route(/\/api\/account\/stats$/, (route) =>
          route.fulfill({
            json: {
              enabled: syncEnabled,
              consentedAt: firstPlayedAtMs,
              authorizationExpiresAt: null,
              lastReadAt: Date.now(),
              disabledAt: syncEnabled ? null : Date.now(),
              lastPlayedAtMs: Date.now(),
              lastSuccessAt: Date.now(),
              lastError: null,
              listenCount: syncEnabled ? 175 : 0,
              recent: [],
            },
          }),
        );
        await page.route(/\/api\/account\/stats\/insights(?:\?|$)/, (route) =>
          route.fulfill({ json: weekInsights(currentWeek).insights }),
        );
        await page.route(/\/api\/account\/stats\/weeks\/access$/, (route) =>
          route.fulfill({
            json: { enabled: syncEnabled, firstPlayedAtMs },
          }),
        );
        await page.route(/\/api\/account\/stats\/weeks\/[0-9-]+(?:\?|$)/, (route) => {
          weeklyDetailRequests += 1;
          if (!syncEnabled) {
            return route.fulfill({ status: 403, json: { _tag: "Forbidden" } });
          }
          const week = new URL(route.request().url()).pathname.split("/").at(-1);
          return route.fulfill({ json: weekInsights(week) });
        });
        await page.route(/\/api\/account\/stats\/weeks\?/, (route) => {
          weeklyHistoryRequests += 1;
          if (!syncEnabled) {
            return route.fulfill({ status: 403, json: { _tag: "Forbidden" } });
          }
          const pageNumber = Math.max(1, Number(new URL(route.request().url()).searchParams.get("page") ?? 1));
          const weeks = observedWeeks.slice((pageNumber - 1) * 12, pageNumber * 12);
          return route.fulfill({
            json: {
              weeks: weeks.map((weekStart) => ({
                weekStart,
                listens: 175 - observedWeeks.indexOf(weekStart) * 4,
                tracks: 86,
                listeningMs: (175 - observedWeeks.indexOf(weekStart) * 4) * 213_000,
                activeDays: weekStart === currentWeek ? 2 : 7,
              })),
              hasMore: pageNumber * 12 < observedWeeks.length,
            },
          });
        });
      },
    },
    {
      name: "weekly query opens the overview in weekly mode",
      run: async (page) => {
        await page.goto("/?week=2026-11-16&page=1");
        await page.getByRole("heading", { name: "Demo listener" }).waitFor();
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
        assert.equal(await page.getByRole("button", { name: "WEEK", exact: true }).getAttribute("aria-pressed"), "true");
        assert.match(await page.locator("main").innerText(), /complete week/i);
      },
    },
    {
      name: "historical week shows the full insights payload",
      note: "The overview's existing insights panel now renders the selected Monday–Sunday week, including charts, artists, and tracks.",
      run: async (page) => {
        assert.match(await page.locator("main").innerText(), /most played tracks/i);
        assert.match(await page.locator("main").innerText(), /neon hours/i);
        assert.equal(await page.locator("input[type=date]").inputValue(), "2026-11-16");
        await page.getByRole("heading", { name: /most played tracks/i }).scrollIntoViewIfNeeded();
      },
    },
    {
      name: "previous week navigates with a backward view transition",
      note: "The week and page stay in the query string while the overview content transitions.",
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
        await page.waitForURL("**/?week=2026-11-09&page=1");
        const types = await page.evaluate(() => window.__weeklyTransitions ?? []);
        assert.ok(types.includes("week-backward"));
        assert.equal(await page.locator("input[type=date]").inputValue(), "2026-11-09");
      },
    },
    {
      name: "observed-week shortcut selects another historical week",
      run: async (page) => {
        await page.getByRole("button", { name: /16 Nov/ }).click();
        await page.waitForURL("**/?week=2026-11-16&page=1");
        const types = await page.evaluate(() => window.__weeklyTransitions ?? []);
        assert.ok(types.includes("week-forward"));
      },
    },
    {
      name: "history pagination is linkable through the page query",
      run: async (page) => {
        await page.getByRole("button", { name: "Next page →" }).click();
        await page.waitForURL("**/?week=2026-11-16&page=2");
        await page.getByRole("button", { name: /31 Aug/ }).waitFor();
        assert.match(await page.locator("main").innerText(), /page 2/i);
      },
    },
    {
      name: "current week is clearly marked as in progress",
      run: async (page) => {
        await page.getByRole("button", { name: "This week" }).click();
        await page.waitForURL(`**/?week=${currentWeek}&page=1`);
        assert.match(await page.locator("main").innerText(), /week in progress/i);
        assert.equal(await page.getByRole("button", { name: "Next week →" }).isDisabled(), true);
      },
    },
    {
      name: "switching to all-time removes weekly query params",
      run: async (page) => {
        await page.getByRole("button", { name: "ALL", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/" && url.search === "");
        assert.equal(await page.getByRole("button", { name: "WEEK", exact: true }).getAttribute("aria-pressed"), "false");
        assert.match(await page.locator("main").innerText(), /all time/i);
      },
    },
    {
      name: "mobile overview week controls and insights reflow",
      run: async (page) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/?week=2026-11-16&page=1");
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
        await page.getByRole("heading", { name: "Choose a week" }).scrollIntoViewIfNeeded();
        assert.equal(await page.getByRole("button", { name: "← Previous week" }).isVisible(), true);
        assert.equal(await page.getByRole("button", { name: "Next page →" }).isVisible(), true);
      },
    },
    {
      name: "reduced motion updates the week without a transition",
      run: async (page) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/?week=2026-11-16&page=1");
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
        const before = await page.evaluate(() => window.__weeklyTransitions ?? []);
        await page.getByRole("button", { name: "← Previous week" }).click();
        await page.waitForURL("**/?week=2026-11-09&page=1");
        const after = await page.evaluate(() => window.__weeklyTransitions ?? []);
        assert.deepEqual(after, before);
      },
    },
    {
      name: "disabled sync hides weekly mode even for a direct query",
      run: async (page) => {
        syncEnabled = false;
        const detailRequests = weeklyDetailRequests;
        const historyRequests = weeklyHistoryRequests;
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.goto("/?week=2026-11-16&page=1");
        await page.getByRole("heading", { name: "Demo listener" }).waitFor();
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
        await page.getByText("Stats are off", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "WEEK", exact: true }).count(), 0);
        assert.equal(await page.getByRole("heading", { name: "Choose a week" }).count(), 0);
        assert.equal(weeklyDetailRequests, detailRequests);
        assert.equal(weeklyHistoryRequests, historyRequests);
      },
    },
  ],
};
