import { describe, expect, it } from "vitest";

import { createPreviewInsights } from "./previewInsights";

const now = Date.UTC(2026, 9, 20, 12, 0, 0);

describe("createPreviewInsights", () => {
  it("creates a complete overview shape", () => {
    const data = createPreviewInsights(now);
    expect(data.totals.listens).toBeGreaterThan(0);
    expect(data.hours).toHaveLength(24);
    expect(data.weekdays).toHaveLength(7);
    expect(data.months).toHaveLength(12);
    expect(data.topTracks).toHaveLength(5);
    expect(data.topArtists).toHaveLength(5);
    expect(data.totals.activeDays).toBeLessThanOrEqual(365);
  });

  it("ends its month series on the current month", () => {
    const data = createPreviewInsights(now);
    expect(data.months.at(-1)?.month).toBe("2026-10");
    expect(data.months[0]?.month).toBe("2025-11");
  });

  it("ships self-contained cover art", () => {
    const data = createPreviewInsights(now);
    expect(
      data.topTracks.every((track) => track.imageUrl?.startsWith("data:image/svg+xml")),
    ).toBe(true);
  });
});
