import { describe, expect, it, vi } from "vitest";

import { installChunkRecovery } from "./chunkRecovery";

function harness(start = 1_000_000) {
  let clock = start;
  let stored: string | null = null;
  const reload = vi.fn();
  const listeners = new Map<string, (event: Event) => void>();
  installChunkRecovery(
    {
      addEventListener: (type, listener) => listeners.set(type, listener),
      location: { reload },
    },
    {
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value;
      },
    },
    () => clock,
  );
  const fire = () => {
    const event = { preventDefault: vi.fn() } as unknown as Event;
    listeners.get("vite:preloadError")?.(event);
    return event;
  };
  return { fire, reload, advance: (ms: number) => (clock += ms) };
}

describe("installChunkRecovery", () => {
  it("reloads when a chunk fails to load", () => {
    const { fire, reload } = harness();
    const event = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("does not reload again inside the cooldown", () => {
    const { fire, reload, advance } = harness();
    fire();
    advance(1_000);
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again once the cooldown has passed", () => {
    const { fire, reload, advance } = harness();
    fire();
    advance(11_000);
    fire();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("reloads even when storage is blocked", () => {
    const reload = vi.fn();
    const listeners = new Map<string, (event: Event) => void>();
    installChunkRecovery(
      {
        addEventListener: (type, listener) => listeners.set(type, listener),
        location: { reload },
      },
      {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    );
    listeners.get("vite:preloadError")?.({ preventDefault: vi.fn() } as unknown as Event);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
