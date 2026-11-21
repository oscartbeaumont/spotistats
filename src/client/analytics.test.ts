import type { CaptureResult, Properties } from "posthog-js";
import { describe, expect, it, vi } from "vitest";

import { UpstreamError } from "~/api";

import {
  isChunkLoadError,
  isHandledError,
  isInjectedScriptError,
  isUnparseableScriptError,
  isUpstreamOutage,
  shouldDropEvent,
} from "./analytics";
import { SpotifyApiError, SpotifyUnauthenticatedError } from "./spotify";

const origin = "https://spotistats.otbeaumont.me";

const loginPage = `${origin}/login`;

/** An `UpstreamError` as the worker's 502 decodes into it. */
const upstream = (service: string, status: number | null) =>
  new UpstreamError({
    service,
    message: "failed",
    status,
  });

/** A PostHog `$exception` event carrying the given stack frames. */
const exception = (
  frames: ReadonlyArray<{ filename?: string }>,
  properties: Properties = {},
): CaptureResult => ({
  uuid: "event",
  event: "$exception",
  properties: {
    $current_url: loginPage,
    ...properties,
    $exception_list: [{ stacktrace: { frames } }],
  },
});

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

  it("drops a frame that names another route, as a single-page navigation reports it", () => {
    expect(
      isInjectedScriptError(
        [
          { filename: `${origin}/` },
          { filename: `${origin}/favourites/albums` },
        ],
        `${origin}/favourites/tracks`,
      ),
    ).toBe(true);
  });

  it("drops same-origin frames that are not built chunks", () => {
    expect(
      isInjectedScriptError(
        [{ filename: `${origin}/assets/logo.svg` }],
        loginPage,
      ),
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

describe("isUnparseableScriptError", () => {
  it("drops Safari's identifier-after-number parse error", () => {
    // https://github.com/oscartbeaumont/spotistats/issues/67
    expect(
      isUnparseableScriptError([
        {
          type: "SyntaxError",
          value: "No identifiers allowed directly after numeric literal",
        },
      ]),
    ).toBe(true);
  });

  it("drops Firefox's wording for the same parse error", () => {
    expect(
      isUnparseableScriptError([
        {
          type: "SyntaxError",
          value: "identifier starts immediately after numeric literal",
        },
      ]),
    ).toBe(true);
  });

  it("keeps a `JSON.parse` failure, which is the app's own bug", () => {
    expect(
      isUnparseableScriptError([
        { type: "SyntaxError", value: "JSON Parse error: Unexpected token" },
      ]),
    ).toBe(false);
  });

  it("keeps other exceptions that mention a numeric literal", () => {
    expect(
      isUnparseableScriptError([
        { type: "TypeError", value: "numeric literal is not a function" },
      ]),
    ).toBe(false);
  });
});

describe("isUpstreamOutage", () => {
  it("treats Spotify's 5xx as an outage", () => {
    // https://github.com/oscartbeaumont/spotistats/issues/70
    expect(isUpstreamOutage(upstream("spotify", 503))).toBe(true);
    expect(isUpstreamOutage(upstream("spotify", 500))).toBe(true);
  });

  it("treats Spotify rate limiting as an outage", () => {
    expect(isUpstreamOutage(upstream("spotify", 429))).toBe(true);
  });

  it("keeps a request Spotify rejected as an app issue", () => {
    expect(isUpstreamOutage(upstream("spotify", 400))).toBe(false);
  });

  it("keeps an unexpected response shape as an app issue", () => {
    // No status means the response did not decode, which the app must fix.
    expect(isUpstreamOutage(upstream("spotify", null))).toBe(false);
  });

  it("leaves database failures alone", () => {
    expect(isUpstreamOutage(upstream("database", 503))).toBe(false);
  });
});

describe("isChunkLoadError", () => {
  it("recognises the browsers' dynamic-import failures", () => {
    // https://github.com/oscartbeaumont/spotistats/issues/73
    expect(
      isChunkLoadError(
        new TypeError("Importing a module script failed."),
      ),
    ).toBe(true);
    expect(
      isChunkLoadError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://spotistats.otbeaumont.me/assets/Export-abc.js",
        ),
      ),
    ).toBe(true);
    expect(
      isChunkLoadError(
        new TypeError(
          "error loading dynamically imported module: https://spotistats.otbeaumont.me/assets/Export-abc.js",
        ),
      ),
    ).toBe(true);
    expect(
      isChunkLoadError(new Error("Unable to preload CSS for /assets/app.css")),
    ).toBe(true);
  });

  it("keeps other failures as app issues", () => {
    expect(
      isChunkLoadError(new TypeError("undefined is not an object")),
    ).toBe(false);
    expect(isChunkLoadError(new Error("boom"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("isHandledError", () => {
  it("treats an expired session as handled", () => {
    // A 401 signs the user out; it is not a crash to file.
    expect(isHandledError(new SpotifyUnauthenticatedError())).toBe(true);
  });

  it("treats a Spotify outage as handled", () => {
    expect(
      isHandledError(
        new UpstreamError({
          service: "spotify",
          message: "Spotify API failed: 503",
          status: 503,
        }),
      ),
    ).toBe(true);
  });

  it("treats a failed chunk load as handled", () => {
    expect(
      isHandledError(new TypeError("Importing a module script failed.")),
    ).toBe(true);
  });

  it("still reports real Spotify failures", () => {
    expect(isHandledError(new SpotifyApiError(500, null))).toBe(false);
    expect(isHandledError(new Error("boom"))).toBe(false);
    expect(isHandledError(undefined)).toBe(false);
  });
});

describe("analytics exception filter", () => {
  it("drops injected-script exceptions before they reach PostHog", () => {
    const injected = exception([{ filename: loginPage }]);
    expect(shouldDropEvent(injected)).toBe(true);

    // No `$current_url` on the event: fall back to the live page URL.
    vi.stubGlobal("window", { location: { href: loginPage } });

    const withoutUrl = exception([{ filename: loginPage }], {
      $current_url: undefined,
    });

    expect(shouldDropEvent(withoutUrl)).toBe(true);
    vi.unstubAllGlobals();

    const app = exception([{ filename: `${origin}/assets/app.js` }]);
    expect(shouldDropEvent(app)).toBe(false);

    // A browser parse error carries no frames to classify, so it needs its
    // own rule.
    const parseError: CaptureResult = {
      uuid: "parse",
      event: "$exception",
      properties: {
        $current_url: loginPage,
        $exception_list: [
          {
            type: "SyntaxError",
            value: "No identifiers allowed directly after numeric literal",
          },
        ],
      },
    };

    expect(shouldDropEvent(parseError)).toBe(true);

    // A chunk load that recovery reloads past is not an app issue.
    const chunkError: CaptureResult = {
      uuid: "chunk",
      event: "$exception",
      properties: {
        $current_url: loginPage,
        $exception_list: [
          {
            type: "TypeError",
            value: "Importing a module script failed.",
          },
        ],
      },
    };

    expect(shouldDropEvent(chunkError)).toBe(true);

    const pageview: CaptureResult = {
      uuid: "pageview",
      event: "$pageview",
      properties: {},
    };

    expect(shouldDropEvent(pageview)).toBe(false);
  });
});
