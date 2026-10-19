/**
 * PostHog analytics, loaded only in the browser.
 *
 * The module is imported by the app root, which the server also renders, so
 * the library is loaded with a dynamic import behind a browser guard. It is
 * disabled in development: nothing is loaded, initialized or sent.
 */

type PostHogClient = typeof import("posthog-js")["default"];

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
