import { describe, expect, it } from "vitest";

import { describeStatsReason } from "./errors";

describe("describeStatsReason", () => {
  it("maps known callback reasons to sentences", () => {
    expect(describeStatsReason("spotify_denied")).toContain("cancelled");
    expect(describeStatsReason("missing_state_cookie")).toContain("cookie");
  });

  it("falls back for an unknown or missing reason", () => {
    expect(describeStatsReason(null)).toBe("the Spotify sign-in did not complete");
    expect(describeStatsReason("surprise")).toBe("unexpected error (surprise)");
  });
});
