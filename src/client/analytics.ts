/**
 * PostHog analytics, loaded only in the browser.
 *
 * The module is imported by the app root, which the server also renders, so
 * the library is loaded with a dynamic import behind a browser guard.
 */

let initialized = false;

export function initAnalytics(): void {
  if (typeof window === "undefined" || initialized || import.meta.env.DEV) return;
  initialized = true;
  void import("posthog-js").then(({ default: posthog }) => {
    posthog.init("phc_qSpwCaUTRLVqXQYGL8zE5RMfm98NUQFiFJdMYymxLSWh", {
      api_host: "/ph_ed90f8",
      ui_host: "https://us.posthog.com",
      defaults: "2025-05-24",
      person_profiles: "identified_only",
      capture_exceptions: true,
    });
  });
}

export function identifyUser(
  id: string,
  properties: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  void import("posthog-js").then(({ default: posthog }) => {
    posthog.identify(id, properties);
  });
}
