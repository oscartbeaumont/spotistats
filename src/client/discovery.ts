import { Schema } from "effect";

import {
  DiscoveryCandidate as CandidateSchema,
  type DiscoveryCandidate,
  type DiscoveryMode,
  type Mood,
  matchesMood,
  moodAttributes,
  selectDiscoveryTracks,
} from "~/lib/discovery";
import { accountApi } from "./api";
import {
  type CatalogTrack,
  CreatedPlaylist,
  createPrivatePlaylist,
  getAudioFeatures,
  getCatalogTracks,
  getDiscoveryTopTracks,
  getProfile,
  getRecommendations,
  getSavedTrackFlags,
  runSpotify,
  setDiscoveryPlaylistTracks,
} from "./spotify";
import { authStore } from "./storage";

/**
 * The account reads discovery performs.
 *
 * Passed in so tests can supply faithful doubles without replacing the API
 * module.
 */
export interface DiscoveryAccountReads {
  discoveryHistory: typeof accountApi.discoveryHistory;
  discoveryKnown: typeof accountApi.discoveryKnown;
}

/** Spotify sometimes returns a track that cannot be played in this market. */
const usable = (
  track: CatalogTrack | null,
): track is CatalogTrack & { id: string } =>
  !!track?.id &&
  !track.is_local &&
  track.is_playable !== false &&
  !track.restrictions;

const candidate = (
  track: CatalogTrack & { id: string },
  source: DiscoveryCandidate["source"],
  reason: string,
): DiscoveryCandidate => ({
  id: track.id,
  name: track.name,
  artistNames: track.artists.map((artist) => artist.name).join(", "),
  artistKey: track.artists[0]?.id ?? track.artists[0]?.name ?? track.id,
  imageUrl: track.album.images[0]?.url ?? null,
  externalUrl: track.external_urls.spotify,
  source,
  reason,
});

const currentToken = () => {
  const store = authStore();

  if (store.status !== "authenticated") {
    throw new Error("Sign in to Spotify first.");
  }

  return store.accessToken;
};

/**
 * Runs each step after the previous one settles.
 *
 * Spotify rate limits the library and catalog lookups, so these batches must
 * not run in parallel; `Array.fromAsync` would say the same thing but is newer
 * than the browsers this app targets.
 */
async function inSequence<Input, Output>(
  items: readonly Input[],
  run: (item: Input) => Promise<Output>,
): Promise<Output[]> {
  const results: Output[] = [];

  await items.reduce(
    (previous, item) =>
      previous.then(async () => {
        results.push(await run(item));
      }),
    Promise.resolve(),
  );

  return results;
}

/** Excludes tracks already in the user's history or liked songs. */
async function unstoredRecommendations(
  seeds: readonly string[],
  mood: Mood,
  accountReads: DiscoveryAccountReads,
): Promise<DiscoveryCandidate[]> {
  const recommendations = await runSpotify(
    getRecommendations(seeds, moodAttributes[mood]),
  );

  const tracks = recommendations.tracks.slice(0, 100).filter(usable);

  const ids = [
    ...new Set(
      tracks.flatMap((track) =>
        track.linked_from
          ? [track.id, track.linked_from.id]
          : [track.id],
      ),
    ),
  ];

  const knownIds = await accountReads.discoveryKnown(ids);

  const batches = Array.from(
    { length: Math.ceil(ids.length / 50) },
    (_, index) => ids.slice(index * 50, index * 50 + 50),
  );

  const savedFlags = await inSequence(batches, async (batch) => {
    const flags = await runSpotify(getSavedTrackFlags(batch));

    if (flags.length !== batch.length) {
      throw new Error(
        "Spotify returned an incomplete library check. Please try again.",
      );
    }

    return flags;
  });

  const known = new Set([
    ...knownIds,
    ...batches.flatMap((batch, index) =>
      batch.filter((_, position) => savedFlags[index]?.[position]),
    ),
  ]);

  return tracks
    .filter(
      (track) =>
        !known.has(track.id) &&
        !known.has(track.linked_from?.id ?? ""),
    )
    .map((track) =>
      candidate(
        track,
        "new",
        "Spotify recommendation based on your favourites; absent from your tracked history and liked songs.",
      ),
    );
}

/** Tracks heard at least twice but not in the last 90 days. */
async function rediscoveredTracks(
  history: Awaited<ReturnType<typeof accountApi.discoveryHistory>>,
  mood: Mood,
): Promise<DiscoveryCandidate[]> {
  if (history.rediscovery.length === 0) return [];

  const features =
    mood === "any"
      ? null
      : await runSpotify(
          getAudioFeatures(
            history.rediscovery.map((track) => track.id).join(","),
          ),
        );

  if (features && features.length !== history.rediscovery.length) {
    throw new Error(
      "Spotify returned incomplete audio features. Please try again.",
    );
  }

  const eligible = history.rediscovery.filter((_, index) =>
    matchesMood(mood, features?.[index]),
  );

  const batches = Array.from(
    { length: Math.ceil(eligible.length / 50) },
    (_, index) => eligible.slice(index * 50, index * 50 + 50),
  );

  const catalogs = await inSequence(batches, async (batch) => {
    const catalog = await runSpotify(
      getCatalogTracks(batch.map((track) => track.id)),
    );

    if (catalog.tracks.length !== batch.length) {
      throw new Error("Spotify returned an incomplete track lookup. Please try again.");
    }

    return catalog;
  });

  return catalogs.flatMap((catalog, batchIndex) =>
    catalog.tracks.flatMap((track, index) => {
      const previous = batches[batchIndex]?.[index];

      if (!previous || !usable(track)) return [];

      return [
        candidate(
          track,
          "rediscover",
          `${previous.listens} tracked plays; last played ${new Date(previous.lastPlayedAtMs).toLocaleDateString()}.`,
        ),
      ];
    }),
  );
}

export async function generateDiscovery(
  mode: DiscoveryMode,
  mood: Mood,
  accountReads: DiscoveryAccountReads = accountApi,
) {
  const token = currentToken();

  const [profile, history] = await Promise.all([
    runSpotify(getProfile()),
    accountReads.discoveryHistory(),
  ]);

  let seeds = history.seeds;

  if (mode !== "rediscover" && seeds.length === 0) {
    seeds = (await runSpotify(getDiscoveryTopTracks())).items
      .filter(usable)
      .slice(0, 5)
      .map((track) => track.id);
  }

  if (mode !== "rediscover") {
    if (seeds.length === 0) {
      throw new Error(
        "Spotify has no top tracks to seed discovery yet. Listen to some music and try again.",
      );
    }
  }

  const fresh =
    mode === "rediscover" ? [] : await unstoredRecommendations(seeds, mood, accountReads);

  const old =
    mode === "new" ? [] : await rediscoveredTracks(history, mood);

  if (currentToken() !== token) {
    throw new Error("Your Spotify session changed. Generate a new selection.");
  }

  return {
    ownerId: profile.id,
    tracks: selectDiscoveryTracks(fresh, old, mode),
  };
}

export const DiscoveryDraft = Schema.Struct({
  ownerId: Schema.String,
  name: Schema.String,
  tracks: Schema.Array(CandidateSchema).check(Schema.isMaxLength(30)),
  playlist: Schema.NullOr(CreatedPlaylist),
  stage: Schema.Literals(["review", "creating", "filling", "saved"]),
});

export type DiscoveryDraft = typeof DiscoveryDraft.Type;

const draftKey = "spotistats-discovery-draft";

export function readDiscoveryDraft(): DiscoveryDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey);

    return raw
      ? Schema.decodeUnknownSync(DiscoveryDraft)(JSON.parse(raw))
      : null;
  } catch {
    return null;
  }
}

export function writeDiscoveryDraft(draft: DiscoveryDraft) {
  // Persist before every write so reloads cannot silently repeat playlist creation.
  sessionStorage.setItem(draftKey, JSON.stringify(draft));
}

export function clearDiscoveryDraft() {
  sessionStorage.removeItem(draftKey);
}

export async function saveDiscoveryPlaylist(
  draft: DiscoveryDraft,
  update: (draft: DiscoveryDraft) => void,
) {
  const token = currentToken();
  const profile = await runSpotify(getProfile());

  if (currentToken() !== token) {
    throw new Error(
      "Your Spotify session changed. Reopen discovery before retrying.",
    );
  }

  if (profile.id !== draft.ownerId) {
    throw new Error(
      "This selection belongs to a different Spotify account. Generate a new one.",
    );
  }

  if (!draft.tracks.length) throw new Error("Select at least one track.");

  if (draft.stage === "creating") {
    throw new Error(
      "Spotify may have created the playlist, but its response was lost. Check your Spotify playlists before starting over.",
    );
  }

  if (draft.stage === "saved") return;

  const persist = (next: DiscoveryDraft) => {
    writeDiscoveryDraft(next);
    update(next);

    return next;
  };

  if (!draft.playlist) {
    draft = persist({ ...draft, stage: "creating" });

    // Never retry this POST: Spotify may have created it even if the response
    // was lost.
    const playlist = await runSpotify(
      createPrivatePlaylist(draft.name.trim() || "Spotistats discovery"),
    );

    if (currentToken() !== token) {
      throw new Error(
        "Your Spotify session changed. Check Spotify for the playlist before starting over.",
      );
    }

    draft = { ...draft, playlist, stage: "filling" };
    // Keep the returned ID in memory even if storage fills after creation.
    update(draft);
    writeDiscoveryDraft(draft);
  }

  if (currentToken() !== token) {
    throw new Error(
      "Your Spotify session changed. Reopen discovery before retrying.",
    );
  }

  const playlist = draft.playlist;

  if (playlist === null) {
    throw new Error("Discovery has no playlist. Reopen discovery before retrying.");
  }

  await runSpotify(
    setDiscoveryPlaylistTracks(
      playlist.id,
      draft.tracks.map((track) => track.id),
    ),
  );

  if (currentToken() !== token) {
    throw new Error(
      "Your Spotify session changed. Check Spotify for the saved playlist.",
    );
  }

  persist({ ...draft, stage: "saved" });
}

export function discoveryError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);

  if (message.includes("403") || message.includes("404")) {
    return "Spotify denied this operation. Recommendations and audio features are restricted for some apps. If saving, reconnect with playlist permission. No substitute results were generated.";
  }

  if (message.includes("429")) {
    return "Spotify is rate limiting requests. Wait a little before trying again.";
  }

  return message;
}
