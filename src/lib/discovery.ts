import { Schema } from "effect";

export type DiscoveryMode = "new" | "rediscover" | "blend";
export type Mood = "any" | "chill" | "focus" | "workout" | "upbeat";

export const moodAttributes: Record<Mood, Readonly<Record<string, number>>> = {
  any: {},
  chill: { max_energy: 0.45, target_energy: 0.3 },
  focus: { min_instrumentalness: 0.5, max_energy: 0.6 },
  workout: { min_energy: 0.7, min_tempo: 110 },
  upbeat: { min_valence: 0.65, min_energy: 0.5 },
};

export function matchesMood(mood: Mood, features: Readonly<Record<string, number>> | null | undefined) {
  if (mood === "any") return true;
  if (!features) return false;
  return Object.entries(moodAttributes[mood]).every(([key, threshold]) => {
    const [bound, ...parts] = key.split("_");
    if (bound === "target") return true;
    const value = features[parts.join("_")];
    return value !== undefined && Number.isFinite(value) && (bound === "min" ? value >= threshold : value <= threshold);
  });
}

export const DiscoveryCandidate = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  artistNames: Schema.String,
  artistKey: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
  externalUrl: Schema.String,
  reason: Schema.String,
  source: Schema.Literals(["new", "rediscover"]),
});
export type DiscoveryCandidate = typeof DiscoveryCandidate.Type;

/** Keep source order, alternate the blend, and cap each primary artist at three tracks. */
export function selectDiscoveryTracks(
  fresh: readonly DiscoveryCandidate[],
  old: readonly DiscoveryCandidate[],
  mode: DiscoveryMode,
  limit = 30,
) {
  const pool = mode === "new" ? fresh : mode === "rediscover" ? old :
    Array.from({ length: Math.max(fresh.length, old.length) }, (_, index) => [fresh[index], old[index]])
      .flat().filter((track): track is DiscoveryCandidate => !!track);
  const ids = new Set<string>();
  const artists = new Map<string, number>();
  const selected: DiscoveryCandidate[] = [];
  for (const track of pool) {
    if (selected.length >= limit) break;
    const count = artists.get(track.artistKey) ?? 0;
    if (ids.has(track.id) || count >= 3) continue;
    selected.push(track);
    ids.add(track.id);
    artists.set(track.artistKey, count + 1);
  }
  return selected;
}
