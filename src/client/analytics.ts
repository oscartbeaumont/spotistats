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

export type PostHogClient = typeof import("posthog-js")["default"];

let client: Promise<PostHogClient> | undefined;

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
