import { describe, expect, it } from "vitest";

import { isChunkLoadFailure } from "./resilience";

describe("isChunkLoadFailure", () => {
  it("recognises the browser's stale chunk errors", () => {
    expect(isChunkLoadFailure(new Error("Importing a module script failed."))).toBe(true);
    expect(
      isChunkLoadFailure(
        new TypeError("Failed to fetch dynamically imported module: /assets/Account-abc.js"),
      ),
    ).toBe(true);
  });

  it("ignores unrelated failures so they are not reload-looped", () => {
    expect(isChunkLoadFailure(new Error("Spotistats: 401 Unauthorized"))).toBe(false);
    expect(isChunkLoadFailure("Script error.")).toBe(false);
    expect(isChunkLoadFailure(undefined)).toBe(false);
  });
});
