/**
 * PostHog analytics, loaded only in the browser.
 *
 * The module is imported by the app root, which the server also renders, so
 * the library is loaded with a dynamic import behind a browser guard.
 */

let initialized = false;

/**
 * Errors raised by cross-origin scripts and by browser extensions arrive in the
 * same project as real application errors, and no change to this codebase can
 * fix them. Two shapes cover almost all of what we see:
 *
 * - Safari and Chrome mask cross-origin failures as a synthetic
 *   `Script error.`, which carries no message and no stack.
 * - Wallet and other extensions assign to globals such as `window.ethereum`
 *   from their own content script, and blame the page they injected into.
 *
 * Dropping them in `before_send` keeps the issue list to things we can act on.
 */
const extensionNoisePatterns = [
  /window\.ethereum/i,
  /\bmetamask\b/i,
  /(?:chrome|moz|safari|safari-web)-extension:\/\//i,
];

export type CapturedEvent = {
  event?: string;
  properties?: Record<string, unknown>;
};

const asText = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
};

const isSyntheticScriptError = (exceptions: unknown): boolean =>
  Array.isArray(exceptions) &&
  exceptions.length > 0 &&
  exceptions.every(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as { mechanism?: { synthetic?: boolean } }).mechanism?.synthetic ===
        true,
  );

const mentionsExtensionNoise = (properties: Record<string, unknown>): boolean => {
  const text = [
    asText(properties.$exception_types),
    asText(properties.$exception_values),
    asText(properties.$exception_list),
  ].join("\n");
  return extensionNoisePatterns.some((pattern) => pattern.test(text));
};

/** Whether an event is noise this project cannot fix. */
export const isUnfixableError = (capture: CapturedEvent): boolean => {
  if (capture.event !== "$exception") return false;
  const properties = capture.properties ?? {};
  return (
    isSyntheticScriptError(properties.$exception_list) ||
    mentionsExtensionNoise(properties)
  );
};

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
      before_send: (capture) =>
        capture && isUnfixableError(capture) ? null : capture,
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
