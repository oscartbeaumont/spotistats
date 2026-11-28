import assert from "node:assert/strict";

import { weekInsights } from "./weekly-stats.ts";

export default {
  title: "Weekly stats error recovery",
  baseUrl: "http://127.0.0.1:5173",
  steps: [
    {
      name: "failed week and access check keep navigation available",
      run: async (page) => {
        await page.goto("/login");
        await page.evaluate(() => {
          localStorage.setItem(
            "auth",
            JSON.stringify({
              status: "authenticated",
              accessToken: "cdp-demo-token",
              linkToUri: false,
            }),
          );
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
              enabled: true,
              consentedAt: Date.UTC(2026, 6, 27),
              authorizationExpiresAt: null,
              lastReadAt: Date.now(),
              disabledAt: null,
              lastPlayedAtMs: Date.now(),
              lastSuccessAt: Date.now(),
              lastError: null,
              listenCount: 175,
              recent: [],
            },
          }),
        );
        await page.route(/\/api\/account\/stats\/weeks\/access$/, (route) =>
          route.fulfill({ status: 500, json: { _tag: "UpstreamError" } }),
        );
        await page.route(/\/api\/account\/stats\/weeks\?/, (route) =>
          route.fulfill({
            json: {
              weeks: [
                {
                  weekStart: "2026-11-16",
                  listens: 175,
                  tracks: 86,
                  listeningMs: 37_275_000,
                  activeDays: 7,
                },
              ],
              hasMore: false,
            },
          }),
        );
        await page.route(/\/api\/account\/stats\/weeks\/[0-9-]+(?:\?|$)/, (route) => {
          const week = new URL(route.request().url()).pathname.split("/").at(-1);
          if (week === "2026-11-16") {
            return route.fulfill({ status: 500, json: { _tag: "UpstreamError" } });
          }
          return route.fulfill({ json: weekInsights(week) });
        });

        await page.goto("/?week=2026-11-16&page=1");
        await page.getByRole("heading", { name: "Could not load your insights" }).waitFor();
        await page.getByRole("heading", { name: "Choose a week" }).waitFor();
        assert.equal(
          await page.getByRole("button", { name: "← Previous week" }).isEnabled(),
          true,
        );
        await page.getByRole("button", { name: "← Previous week" }).click();
        await page.waitForURL("**/?week=2026-11-09&page=1");
        await page.getByRole("heading", { name: /Listening Insights/ }).waitFor();
      },
    },
  ],
};
