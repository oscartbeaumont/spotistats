/**
 * PostHog analytics, loaded only in the browser.
 *
 * The module is imported by the app root, which the server also renders, so
 * the library is loaded with a dynamic import behind a browser guard. It is
 * disabled in development: nothing is loaded, initialized or sent.
 *
 * Error reporting and the product-event taxonomy live here so callers import
 * one module and the events stay in one place.
 */

import type { InsightsRange } from "~/api";

import { SpotifyUnauthenticatedError } from "./spotify";

export type PostHogClient = typeof import("posthog-js")["default"];

let client: Promise<PostHogClient> | undefined;

/** One frame of a PostHog `$exception` stack. Client events use `filename`. */
type ExceptionFrame = { filename?: string; source?: string };

/** One entry of an `$exception` event's exception list. */
interface Exception {
  type?: string;
  value?: string;
  stacktrace?: { frames?: unknown };
}

/** The exceptions an `$exception` event carries. */
function exceptionList(event: {
  properties?: Record<string, unknown>;
}): Exception[] {
  const list = event.properties?.["$exception_list"];
  return Array.isArray(list) ? (list as Exception[]) : [];
}

/** Every stack frame across an `$exception` event's exception list. */
function exceptionFrames(exceptions: ReadonlyArray<Exception>): ExceptionFrame[] {
  const frames: ExceptionFrame[] = [];
  for (const exception of exceptions) {
    const stack = exception?.stacktrace;
    if (Array.isArray(stack?.frames)) {
      frames.push(...(stack.frames as ExceptionFrame[]));
    }
  }
  return frames;
}

/** The extension of a built JavaScript chunk. */
const scriptPath = /\.(?:c|m)?js$/;

/**
 * Whether a frame names a script the app served.
 *
 * Injected and inline scripts are never bundled by the app, so their frames
 * name something else: Chrome iOS reports its injected content script and the
 * browser reports inline handlers and string-evaluated code as the page URL
 * (or, while a single-page app navigates, as one of its routes), Chromium
 * reports them as `<anonymous>`, and extensions use their own scheme.
 *
 * A script the app served is therefore a same-origin `http(s)` URL that names
 * a built chunk: a document, a route or inline code is an extensionless page
 * path, while the bundles Vite emits end in `.js`. Matching the document path
 * alone missed frames that named a route the app had navigated to without a
 * reload, so those crashes were filed as app issues.
 */
function namesAppScript(frame: ExceptionFrame, pageUrl: string): boolean {
  const filename = frame.filename ?? frame.source;
  if (!filename || filename.startsWith("<")) return false;
  try {
    const script = new URL(filename, pageUrl);
    const document = new URL(pageUrl);
    if (script.origin !== document.origin) return false;
    if (script.protocol !== "http:" && script.protocol !== "https:") {
      return false;
    }
    return scriptPath.test(script.pathname);
  } catch {
    return false;
  }
}

/**
 * Whether an exception came from a script the app does not serve.
 *
 * PostHog groups these as app issues because injected frames share the app's
 * origin, and its own injected-script filter only matches the scripts that
 * sign their errors (Firefox's `__firefox__` and Chrome iOS's `__gCrWeb`). A
 * real error from this app always has at least one frame in a script it
 * served, so an exception with no such frame is safe to drop.
 */
export function isInjectedScriptError(
  frames: ReadonlyArray<ExceptionFrame>,
  pageUrl: string,
): boolean {
  if (frames.length === 0) return false;
  return frames.every((frame) => !namesAppScript(frame, pageUrl));
}

/**
 * Every engine's wording for an identifier straight after a number literal.
 * Safari says "No identifiers allowed directly after numeric literal", Firefox
 * "identifier starts immediately after numeric literal", and V8 "Invalid or
 * unexpected token" — which is shared with too many other failures to match on,
 * so a V8 report is left alone.
 */
const afterNumericLiteral = /numeric literal/i;

/**
 * Whether the browser could not parse a script it downloaded.
 *
 * A `SyntaxError` with this wording means the engine found text such as `12px`
 * outside a string. Nothing the app ships can contain that — the build compiles
 * every chunk and would fail on it — so the script came from somewhere else: a
 * browser extension, an injected script, or a truncated download. Safari
 * reports these with no stack frames at all, so the frame-based filter below
 * cannot classify them.
 */
export function isUnparseableScriptError(
  exceptions: ReadonlyArray<Exception>,
): boolean {
  return exceptions.some(
    (exception) =>
      exception?.type === "SyntaxError" &&
      typeof exception.value === "string" &&
      afterNumericLiteral.test(exception.value),
  );
}

/**
 * A failure the worker declares when Spotify or the database does not answer.
 * The client receives it as the tagged `UpstreamError` from the shared API.
 */
interface UpstreamFailure {
  _tag: "UpstreamError";
  service: string;
  status: number | null;
}

function isUpstreamError(error: unknown): error is UpstreamFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "UpstreamError"
  );
}

/**
 * Whether Spotify itself is unavailable or throttling the request.
 *
 * The app cannot fix an external outage, and the worker has already retried
 * transient 5xx responses, so a failure that reaches here is worth explaining
 * to the user but not worth filing as an app issue. A `null` status is
 * deliberately excluded: that is an unexpected response shape, which is the
 * app's problem to fix.
 */
export function isUpstreamOutage(error: unknown): boolean {
  if (!isUpstreamError(error) || error.service !== "spotify") return false;
  return error.status === 429 || (error.status !== null && error.status >= 500);
}

/** Whether the stored Spotify session expired and the app is signing out. */
export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof SpotifyUnauthenticatedError;
}

/**
 * Every browser's wording for a dynamic import that did not load.
 *
 * A deploy replaces the hashed route chunks, and a mobile connection can drop
 * the request for one. Vite turns the rejection into `vite:preloadError`,
 * `installChunkRecovery` reloads, and the boundary sees the rejected import on
 * the way out. There is no app bug to fix, so it must not file an issue.
 */
const chunkLoadFailure =
  /dynamically imported module|importing a module script failed|unable to preload css/i;

/** Whether an error is a failed lazy-chunk load that recovery reloads past. */
export function isChunkLoadError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return false;
  }
  return (
    typeof error.message === "string" && chunkLoadFailure.test(error.message)
  );
}

/**
 * Whether an error is expected and already handled.
 *
 * A 401 means the stored session expired or was revoked. The request clears the
 * session and the layout sends the user to the sign-in screen, so the boundary
 * only ever sees the error on the way there. A Spotify outage is the same: the
 * boundary offers a retry, but there is no bug to fix. A failed chunk load is
 * recovered by a reload. None is a crash worth an issue.
 */
export function isHandledError(error: unknown): boolean {
  return (
    isSessionExpiredError(error) ||
    isUpstreamOutage(error) ||
    isChunkLoadError(error)
  );
}

/** Whether PostHog should drop this event before it is sent. */
function shouldDropEvent(event: {
  event?: string;
  properties?: Record<string, unknown>;
}): boolean {
  if (event.event !== "$exception") return false;
  const exceptions = exceptionList(event);
  if (isUnparseableScriptError(exceptions)) return true;
  if (
    exceptions.some(
      (exception) =>
        typeof exception?.value === "string" &&
        chunkLoadFailure.test(exception.value),
    )
  ) {
    return true;
  }
  const currentUrl = event.properties?.["$current_url"];
  const pageUrl =
    typeof currentUrl === "string" ? currentUrl : window.location.href;
  return isInjectedScriptError(exceptionFrames(exceptions), pageUrl);
}

/**
 * Loads and initializes PostHog once, or returns `undefined` when analytics
 * must not run (server render, or a development build). Callers share the same
 * promise, so a call made before boot waits for initialization instead of
 * racing it.
 */
function analytics(): Promise<PostHogClient> | undefined {
  if (typeof window === "undefined" || import.meta.env.DEV) return undefined;
  client ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init("phc_qSpwCaUTRLVqXQYGL8zE5RMfm98NUQFiFJdMYymxLSWh", {
      api_host: "/ph_ed90f8",
      ui_host: "https://us.posthog.com",
      defaults: "2025-05-24",
      person_profiles: "identified_only",
      capture_exceptions: true,
      // Injected and inline scripts report the page URL or `<anonymous>` as
      // their frame filename, so their errors look like app crashes. Drop them
      // rather than filing an issue the app cannot fix.
      before_send: (event) => {
        if (event === null) return event;
        return shouldDropEvent(event) ? null : event;
      },
    });
    return posthog;
  });
  return client;
}

export function initAnalytics(): void {
  void analytics();
}

/**
 * The shared PostHog client, or `undefined` when analytics must not run
 * (server render or a development build). Feature flags live with analytics
 * because the same client answers both, and callers still share one load.
 */
export function posthogClient(): Promise<PostHogClient> | undefined {
  return analytics();
}

export function identifyUser(
  id: string,
  properties: Record<string, unknown>,
): void {
  void analytics()?.then((posthog) => posthog.identify(id, properties));
}

/**
 * Reports an error to PostHog error tracking. The app's error boundary handles
 * its errors, so PostHog's global handlers never see them. A no-op in
 * development, alongside the rest of analytics.
 */
export function captureError(error: unknown): void {
  // An expired session is handled by signing the user out, so reporting it
  // files an issue nobody can fix.
  if (isHandledError(error)) return;
  void analytics()?.then((posthog) => posthog.captureException(error));
}

/**
 * Clears the identified person. Called on logout so a later login on the same
 * browser is not merged into the previous user's profile.
 */
export function resetAnalytics(): void {
  void analytics()?.then((posthog) => posthog.reset());
}

/** Where a failed login stopped, so the funnel can tell the modes apart. */
export type LoginFailureReason =
  | "start_failed"
  | "state_mismatch"
  | "network_error"
  | "rejected"
  | "invalid_response";

/** The lists a Spotify item can be opened from. */
export type ItemSurface = "favourites" | "insights" | "recent";

/** Spotify's own ranges for top items. */
export type FavouritesRange = "short" | "medium" | "long";

/** No-property events still pass an object, so every call site looks alike. */
type NoProperties = Record<string, never>;

/**
 * Every product event Spotistats records, mapped to the properties it carries.
 *
 * This map is the taxonomy: a renamed or misspelled event is a type error
 * rather than a data point that quietly stops arriving.
 */
export interface AnalyticsEvents {
  /** A visitor pressed one of the connect buttons. */
  login_started: { source: "login_page" | "seo_cta" };
  login_succeeded: NoProperties;
  login_failed: { reason: LoginFailureReason };
  logout: NoProperties;
  /** The conversion that matters most: listening-stats sync was turned on. */
  stats_sync_enabled: NoProperties;
  /** The sync handshake came back failed, with the reason the account shows. */
  stats_sync_failed: { reason: string | null };
  /** Spotify denied the stats authorization, usually because the user cancelled. */
  stats_sync_denied: NoProperties;
  stats_sync_disabled: NoProperties;
  stats_refresh_requested: NoProperties;
  account_data_deleted: NoProperties;
  /** A stored-listening export finished downloading. */
  listening_data_exported: { format: "json" | "csv" };
  playlist_exported: { kind: "liked_songs" | "playlist"; trackCount: number };
  library_backed_up: { playlistCount: number };
  insights_range_changed: { range: InsightsRange };
  insights_preview_opened: NoProperties;
  insights_preview_exited: NoProperties;
  favourites_range_changed: { range: FavouritesRange };
  favourites_kind_changed: { kind: "tracks" | "albums" };
  spotify_item_opened: { kind: "track" | "album"; surface: ItemSurface };
  /**
   * Spotify refused a request with a 429. A rate limit is an external
   * condition the page can wait out, so it travels as an event rather than as
   * an exception that files an app issue.
   */
  spotify_rate_limited: { surface: "favourites" };
}

/**
 * Records a product event. A no-op in development and during server render,
 * alongside the rest of analytics.
 */
export function capture<K extends keyof AnalyticsEvents>(
  event: K,
  properties: AnalyticsEvents[K],
): void {
  void analytics()?.then((posthog) => posthog.capture(event, properties));
}
