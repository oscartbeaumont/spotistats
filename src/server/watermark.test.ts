import { describe, expect, it } from "vitest";

import { nextWatermark } from "./watermark";

describe("nextWatermark", () => {
  it("keeps the previous cursor when there are no plays", () => {
    expect(nextWatermark(0, [], 100)).toBe(100);
    expect(nextWatermark(0, [], null)).toBeNull();
  });

  it("advances to the newest play on a short page", () => {
    expect(nextWatermark(2, [200, 100], 50)).toBe(200);
  });

  it("stays at the oldest play on a full page", () => {
    expect(nextWatermark(50, [500, 400, 300], 100)).toBe(300);
  });
});
