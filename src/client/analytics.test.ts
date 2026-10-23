import { afterEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("posthog-js", () => ({ default: posthog }));

import { isInjectedScriptError } from "./analytics";

const origin = "https://spotistats.otbeaumont.me";
const loginPage = `${origin}/login`;

describe("isInjectedScriptError", () => {
  it("drops frames that name the document, as Chrome iOS reports them", () => {
    expect(
      isInjectedScriptError(
        [{ filename: loginPage }, { filename: loginPage }],
        loginPage,
      ),
    ).toBe(true);
  });

  it("compares by path, so a query string still counts as the document", () => {
    expect(
      isInjectedScriptError([{ filename: `${loginPage}?start=1` }], loginPage),
    ).toBe(true);
  });

  it("drops `<anonymous>` frames, as Chromium reports inline code", () => {
    expect(
      isInjectedScriptError(
        [{ filename: "<anonymous>" }, { filename: "<anonymous>" }],
        loginPage,
      ),
    ).toBe(true);
  });

  it("drops frames with no filename, or one on another scheme", () => {
    expect(isInjectedScriptError([{ filename: undefined }], loginPage)).toBe(
      true,
    );
    expect(
      isInjectedScriptError(
        [{ filename: "webkit-masked-url://hidden/" }],
        loginPage,
      ),
    ).toBe(true);
    expect(
      isInjectedScriptError(
        [{ filename: "https://cdn.example.com/app.js" }],
        loginPage,
      ),
    ).toBe(true);
  });

  it("keeps an exception with a frame in a script the app served", () => {
    expect(
      isInjectedScriptError(
        [
          { filename: `${origin}/assets/spotify-C-3ocQmo.js` },
          { filename: loginPage },
        ],
        loginPage,
      ),
    ).toBe(false);
  });

  it("keeps an exception with no frames", () => {
    expect(isInjectedScriptError([], loginPage)).toBe(false);
  });

  it("reads the normalised `source` name as well as `filename`", () => {
    expect(isInjectedScriptError([{ source: "/login" }], loginPage)).toBe(true);
    expect(
      isInjectedScriptError([{ source: "/assets/spotify-C-3ocQmo.js" }], loginPage),
    ).toBe(false);
  });
});

describe("analytics exception filter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    posthog.init.mockClear();
  });

  it("drops injected-script exceptions before they reach PostHog", async () => {
    vi.stubGlobal("window", { location: { href: loginPage } });
    const dev = import.meta.env.DEV;
    import.meta.env.DEV = false;
    try {
      const analytics = await import("./analytics");
      analytics.initAnalytics();
      await vi.waitFor(() => expect(posthog.init).toHaveBeenCalledTimes(1));

      const config = posthog.init.mock.calls[0]?.[1] as {
        before_send: (event: unknown) => unknown;
      };
      const exception = (
        frames: unknown[],
        properties: Record<string, unknown> = {},
      ) => ({
        event: "$exception",
        properties: {
          $current_url: loginPage,
          ...properties,
          $exception_list: [{ stacktrace: { frames } }],
        },
      });

      const injected = exception([{ filename: loginPage }]);
      expect(config.before_send(injected)).toBeNull();

      // No `$current_url` on the event: fall back to the live page URL.
      const withoutUrl = exception([{ filename: loginPage }], {
        $current_url: undefined,
      });
      expect(config.before_send(withoutUrl)).toBeNull();

      const app = exception([{ filename: `${origin}/assets/app.js` }]);
      expect(config.before_send(app)).toBe(app);

      const pageview = { event: "$pageview", properties: {} };
      expect(config.before_send(pageview)).toBe(pageview);
    } finally {
      import.meta.env.DEV = dev;
    }
  });
});
