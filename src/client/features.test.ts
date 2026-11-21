import { afterEach, expect, it, vi } from "vitest";

import { discoveryEnabled, initFeatureFlags, type FeatureFlagClient } from "./features";

let client: Promise<FeatureFlagClient> | undefined;

afterEach(() => {
  client = undefined;
  vi.resetModules();
});

const loadClient = () => client;

it("keeps discovery hidden when PostHog cannot answer", async () => {
  client = Promise.resolve({
    isFeatureEnabled: () => undefined,
    onFeatureFlags: () => {},
  });
  initFeatureFlags(loadClient);
  await client;
  expect(discoveryEnabled()).toBe(false);
});

it("reveals discovery once the flag resolves for the person", async () => {
  let fire: (() => void) | undefined;

  const posthog = {
    isFeatureEnabled: vi.fn(() => false),
    onFeatureFlags: (callback: () => void) => {
      fire = callback;
    },
  };

  client = Promise.resolve(posthog);
  initFeatureFlags(loadClient);
  await client;
  expect(discoveryEnabled()).toBe(false);
  posthog.isFeatureEnabled.mockReturnValue(true);
  fire?.();
  expect(discoveryEnabled()).toBe(true);
});

it("does not enable discovery on a production build without analytics", () => {
  const previous = import.meta.env.DEV;
  import.meta.env.DEV = false;

  try {
    initFeatureFlags();
    expect(discoveryEnabled()).toBe(false);
  } finally {
    import.meta.env.DEV = previous;
  }
});

it("keeps discovery hidden when the analytics chunk fails to load", async () => {
  client = Promise.reject(new Error("chunk load failed"));
  initFeatureFlags(loadClient);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  expect(discoveryEnabled()).toBe(false);
});
