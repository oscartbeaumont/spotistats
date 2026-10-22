import { afterEach, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("./analytics", () => ({ posthogClient: () => client.value }));

import { discoveryEnabled, initFeatureFlags } from "./features";

afterEach(() => {
  client.value = undefined;
  vi.resetModules();
});

it("keeps discovery hidden when PostHog cannot answer", async () => {
  client.value = Promise.resolve({
    isFeatureEnabled: () => undefined,
    onFeatureFlags: () => {},
  });
  initFeatureFlags();
  await client.value;
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
  client.value = Promise.resolve(posthog);
  initFeatureFlags();
  await client.value;
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
