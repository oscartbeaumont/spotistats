import type { ListeningInsights } from "~/api";

/**
 * A deterministic sample overview shown before a user enables listening
 * stats. It never leaves the browser and is never written to the database.
 */

const cover = (background: string, foreground: string, label: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${background}"/><circle cx="150" cy="150" r="95" fill="none" stroke="${foreground}" stroke-width="10"/><circle cx="150" cy="150" r="28" fill="${foreground}"/><text x="18" y="282" font-family="monospace" font-size="26" font-weight="bold" fill="${foreground}">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const monthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const monthCounts = [180, 355, 240, 210, 330, 280, 415, 390, 460, 520, 480, 402];

export function createPreviewInsights(now = Date.now()): ListeningInsights {
  const today = new Date(now);
  const trend = monthCounts.map((listens, index) => {
    const offset = index - (monthCounts.length - 1);
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1),
    );
    // Vary the average track length so the time line does not just mirror the
    // play bars in the sample data.
    const averageTrackMs = 168_000 + ((index * 41_000) % 96_000);
    return {
      bucket: monthKey(date),
      listens,
      listeningMs: listens * averageTrackMs,
    };
  });

  const topTracks = [
    {
      trackId: "preview-1",
      name: "Neon Skyline",
      artistNames: "Aurora Vale",
      imageUrl: cover("#1DB954", "#0a0a0a", "NEON"),
      externalUrl: "https://open.spotify.com",
      listens: 148,
    },
    {
      trackId: "preview-2",
      name: "Glass Rivers",
      artistNames: "Aurora Vale, Kite Theory",
      imageUrl: cover("#8B5CF6", "#f0ede8", "GLASS"),
      externalUrl: "https://open.spotify.com",
      listens: 121,
    },
    {
      trackId: "preview-3",
      name: "Static Bloom",
      artistNames: "Paper Cranes",
      imageUrl: cover("#F59E0B", "#0a0a0a", "BLOOM"),
      externalUrl: "https://open.spotify.com",
      listens: 106,
    },
    {
      trackId: "preview-4",
      name: "Slow Motion",
      artistNames: "Kite Theory",
      imageUrl: cover("#3B82F6", "#f0ede8", "SLOW"),
      externalUrl: "https://open.spotify.com",
      listens: 94,
    },
    {
      trackId: "preview-5",
      name: "Midnight Run",
      artistNames: "Aurora Vale",
      imageUrl: cover("#EC4899", "#f0ede8", "RUN"),
      externalUrl: "https://open.spotify.com",
      listens: 81,
    },
  ];

  return {
    generatedAt: now,
    totals: {
      listens: 4812,
      tracks: 1204,
      artists: 437,
      listeningMs: 1_087_440_000,
      activeDays: 214,
      firstPlayedAtMs: now - 430 * 24 * 60 * 60 * 1000,
      lastPlayedAtMs: now,
    },
    streak: {
      current: 12,
      longest: 38,
      longestEndedOn: isoDay(now - 42 * 24 * 60 * 60 * 1000),
    },
    hours: [
      88, 61, 34, 21, 12, 10, 18, 44, 96, 140, 166, 181, 174, 160, 148, 170,
      208, 258, 306, 342, 320, 279, 214, 138,
    ],
    weekdays: [520, 560, 610, 640, 790, 860, 832],
    trend,
    trendUnit: "month",
    topTracks,
    topArtists: [
      { name: "Aurora Vale", listens: 412, tracks: 38 },
      { name: "Kite Theory", listens: 356, tracks: 31 },
      { name: "Paper Cranes", listens: 241, tracks: 22 },
      { name: "Velvet Static", listens: 188, tracks: 17 },
      { name: "Low Tide Club", listens: 141, tracks: 13 },
    ],
    onePlayTracks: 602,
    lateNightListens: 1563,
    busiestDay: {
      date: isoDay(now - 59 * 24 * 60 * 60 * 1000),
      listens: 74,
    },
  };
}
