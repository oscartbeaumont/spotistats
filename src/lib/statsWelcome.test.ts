import { describe, expect, it } from "vitest";

import { welcomePhase, welcomeSteps } from "./statsWelcome";

const input = (overrides: Partial<Parameters<typeof welcomePhase>[0]> = {}) => ({
  seenStatus: true,
  listenCount: 0,
  lastSuccessAt: null,
  lastError: null,
  polls: 1,
  pollLimit: 20,
  ...overrides,
});

describe("welcomePhase", () => {
  it("waits for the first status read", () => {
    expect(welcomePhase(input({ seenStatus: false }))).toBe("connecting");
  });

  it("reports the first sync while it is in flight", () => {
    expect(welcomePhase(input())).toBe("syncing");
  });

  it("settles as soon as listens are stored", () => {
    // A successful sync sometimes lands before the panel notices the error,
    // and stored plays mean the feature is working either way.
    expect(welcomePhase(input({ listenCount: 50 }))).toBe("ready");
    expect(
      welcomePhase(input({ listenCount: 1, lastError: "Spotify said no" })),
    ).toBe("ready");
  });

  it("calls out a failure before anything has synced", () => {
    expect(
      welcomePhase(input({ lastError: "invalid_grant", polls: 3 })),
    ).toBe("failed");
  });

  it("does not call out a failure once the account has synced before", () => {
    expect(
      welcomePhase(
        input({ lastError: "Spotify unavailable", lastSuccessAt: 1, polls: 3 }),
      ),
    ).toBe("syncing");
  });

  it("distinguishes an empty history from a slow one", () => {
    expect(
      welcomePhase(input({ polls: 20, lastSuccessAt: 1 })),
    ).toBe("empty");
    expect(welcomePhase(input({ polls: 20 }))).toBe("slow");
  });

  it("keeps waiting just below the limit", () => {
    expect(welcomePhase(input({ polls: 19, lastSuccessAt: 1 }))).toBe("syncing");
  });
});

describe("welcomeSteps", () => {
  it("marks the import as active while it runs", () => {
    expect(welcomeSteps("syncing")).toEqual([
      { label: "Spotify connected", state: "done" },
      { label: "Importing recent plays", state: "active" },
      { label: "Your insights", state: "todo" },
    ]);
  });

  it("hands the highlight to the insights once they are ready", () => {
    expect(welcomeSteps("ready")).toEqual([
      { label: "Spotify connected", state: "done" },
      { label: "Importing recent plays", state: "done" },
      { label: "Your insights", state: "active" },
    ]);
  });

  it("stops claiming progress once the instant path gives up", () => {
    expect(welcomeSteps("slow")[1]?.state).toBe("todo");
    expect(welcomeSteps("failed")[1]?.state).toBe("todo");
  });
});
