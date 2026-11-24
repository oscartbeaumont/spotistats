import { describe, expect, it } from "vitest";

import { weeklyAccessState } from "./weeklyStats";

describe("weeklyAccessState", () => {
  it("enables only an explicitly enabled, settled response", () => {
    expect(weeklyAccessState({ enabled: true, firstPlayedAtMs: 1 }, false)).toBe(
      "enabled",
    );
  });

  it("fails closed for disabled, missing and failed responses", () => {
    expect(weeklyAccessState({ enabled: false, firstPlayedAtMs: 1 }, false)).toBe(
      "disabled",
    );
    expect(weeklyAccessState(null, false)).toBe("disabled");
    expect(weeklyAccessState(null, true)).toBe("loading");
  });
});
