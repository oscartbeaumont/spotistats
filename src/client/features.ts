import { createSignal } from "solid-js";

import { posthogClient } from "./analytics";

/**
 * PostHog-gated features.
 *
 * A missing, unloaded or failed flag keeps a feature off, so the default is
 * closed: an unreleased feature stays hidden rather than leaking to everyone
 * when PostHog cannot answer.
 */

/** The flag that releases music discovery. */
export const discoveryFlag = "music-discovery";

/**
 * The PostHog surface feature flags need.
 *
 * Narrower than the full client so a test can pass a faithful double without
 * loading PostHog.
 */
export interface FeatureFlagClient {
  isFeatureEnabled(flag: string): boolean | undefined;
  onFeatureFlags(callback: () => void): void;
}

const [discoveryEnabled, setDiscoveryEnabled] = createSignal(false);

export { discoveryEnabled };

const readFlag = (posthog: FeatureFlagClient) =>
  posthog.isFeatureEnabled(discoveryFlag) === true;

/**
 * Starts watching the discovery flag. Analytics is off during server render and
 * in development, so a development build exposes discovery to be worked on
 * locally; production always reads the flag from PostHog.
 */
export function initFeatureFlags(
  loadClient: () => Promise<FeatureFlagClient> | undefined = posthogClient,
): void {
  const client = loadClient();

  if (!client) {
    setDiscoveryEnabled(import.meta.env.DEV);

    return;
  }

  void client
    .then((posthog) => {
      // Identify reloads flags for the signed-in person, and this callback runs
      // again each time, so a late flag load still reveals the feature.
      posthog.onFeatureFlags(() => setDiscoveryEnabled(readFlag(posthog)));
      setDiscoveryEnabled(readFlag(posthog));
    })
    // A failed analytics chunk must keep the feature closed, not throw.
    .catch(() => setDiscoveryEnabled(false));
}
