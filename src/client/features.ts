import { createSignal } from "solid-js";

import { posthogClient, type PostHogClient } from "./analytics";

/**
 * PostHog-gated features.
 *
 * A missing, unloaded or failed flag keeps a feature off, so the default is
 * closed: an unreleased feature stays hidden rather than leaking to everyone
 * when PostHog cannot answer.
 */

/** The flag that releases music discovery. */
export const discoveryFlag = "music-discovery";

const [discoveryEnabled, setDiscoveryEnabled] = createSignal(false);
export { discoveryEnabled };

const readFlag = (posthog: PostHogClient) =>
  posthog.isFeatureEnabled(discoveryFlag) === true;

/**
 * Starts watching the discovery flag. Analytics is off during server render and
 * in development, so a development build exposes discovery to be worked on
 * locally; production always reads the flag from PostHog.
 */
export function initFeatureFlags(): void {
  const client = posthogClient();
  if (!client) {
    setDiscoveryEnabled(import.meta.env.DEV);
    return;
  }
  void client.then((posthog) => {
    // Identify reloads flags for the signed-in person, and this callback runs
    // again each time, so a late flag load still reveals the feature.
    posthog.onFeatureFlags(() => setDiscoveryEnabled(readFlag(posthog)));
    setDiscoveryEnabled(readFlag(posthog));
  });
}
