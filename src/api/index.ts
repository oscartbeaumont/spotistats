import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/http-api";

/**
 * The shared contract between the Spotistats client and its worker.
 *
 * Both sides import this module. The server implements it with `HttpApiBuilder`
 * and the browser consumes it with `HttpApiClient`, so the success and error
 * types on the client are derived from the same schemas the server encodes.
 */

const RecentListen = Schema.Struct({
  playedAt: Schema.String,
  playedAtMs: Schema.Finite,
  name: Schema.String,
  albumName: Schema.NullOr(Schema.String),
  artistNames: Schema.NullOr(Schema.String),
  imageUrl: Schema.NullOr(Schema.String),
  externalUrl: Schema.NullOr(Schema.String),
});

export const TrackingStatus = Schema.Struct({
  enabled: Schema.Boolean,
  consentedAt: Schema.NullOr(Schema.Finite),
  /** When the stored Spotify authorization lapses; refresh tokens last six months. */
  authorizationExpiresAt: Schema.NullOr(Schema.Finite),
  lastReadAt: Schema.NullOr(Schema.Finite),
  disabledAt: Schema.NullOr(Schema.Finite),
  lastPlayedAtMs: Schema.NullOr(Schema.Finite),
  lastSuccessAt: Schema.NullOr(Schema.Finite),
  lastError: Schema.NullOr(Schema.String),
  listenCount: Schema.Finite,
  recent: Schema.Array(RecentListen),
});

export type TrackingStatus = typeof TrackingStatus.Type;

/** Cheap, non-mutating access check used by the overview's weekly mode. */
export const WeeklyAccess = Schema.Struct({
  enabled: Schema.Boolean,
  firstPlayedAtMs: Schema.NullOr(Schema.Finite),
});

export type WeeklyAccess = typeof WeeklyAccess.Type;

export const WeeklySummary = Schema.Struct({
  weekStart: Schema.String,
  listens: Schema.Finite,
  tracks: Schema.Finite,
  listeningMs: Schema.Finite,
  activeDays: Schema.Finite,
});

export type WeeklySummary = typeof WeeklySummary.Type;

export const WeeklyHistory = Schema.Struct({
  weeks: Schema.Array(WeeklySummary),
  hasMore: Schema.Boolean,
});

export type WeeklyHistory = typeof WeeklyHistory.Type;

export interface WeeklyHistoryQuery {
  readonly tzOffset: number;
  readonly page: number;
  readonly limit: number;
}

export const RefreshResult = Schema.Struct({
  queued: Schema.Boolean,
});

export type RefreshResult = typeof RefreshResult.Type;

const TopTrack = Schema.Struct({
  trackId: Schema.String,
  name: Schema.String,
  artistNames: Schema.NullOr(Schema.String),
  imageUrl: Schema.NullOr(Schema.String),
  externalUrl: Schema.NullOr(Schema.String),
  listens: Schema.Finite,
});

const TopArtist = Schema.Struct({
  name: Schema.String,
  listens: Schema.Finite,
  tracks: Schema.Finite,
});

export const DiscoveryTrack = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  artistNames: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
  externalUrl: Schema.NullOr(Schema.String),
  listens: Schema.Finite,
  lastPlayedAtMs: Schema.Finite,
});

export type DiscoveryTrack = typeof DiscoveryTrack.Type;

export const DiscoveryHistory = Schema.Struct({
  seeds: Schema.Array(Schema.String),
  rediscovery: Schema.Array(DiscoveryTrack),
});

export type DiscoveryHistory = typeof DiscoveryHistory.Type;

export const InsightsRange = Schema.Literals([
  "all",
  "week",
  "month",
  "sixMonths",
  "custom",
]);

export type InsightsRange = typeof InsightsRange.Type;

export interface InsightsQuery {
  readonly tzOffset: number;
  readonly range: InsightsRange;
  readonly fromMs: number | null;
  readonly toMs: number | null;
}

/**
 * Aggregates derived from the listens Spotistats collected itself. Spotify
 * only exposes a short recently-played window, so these are the numbers that
 * can only come from keeping history server-side.
 */
export const ListeningInsights = Schema.Struct({
  generatedAt: Schema.Finite,
  totals: Schema.Struct({
    listens: Schema.Finite,
    tracks: Schema.Finite,
    artists: Schema.Finite,
    listeningMs: Schema.Finite,
    activeDays: Schema.Finite,
    firstPlayedAtMs: Schema.NullOr(Schema.Finite),
    lastPlayedAtMs: Schema.NullOr(Schema.Finite),
  }),
  streak: Schema.Struct({
    current: Schema.Finite,
    longest: Schema.Finite,
    longestEndedOn: Schema.NullOr(Schema.String),
  }),
  /** Listens per local hour of day, index 0 is midnight. */
  hours: Schema.Array(Schema.Finite),
  /** Listens per local weekday, index 0 is Monday. */
  weekdays: Schema.Array(Schema.Finite),
  /** Adaptive trend buckets: daily for short ranges, monthly for long ones. */
  trend: Schema.Array(
    Schema.Struct({
      bucket: Schema.String,
      listens: Schema.Finite,
      /** Total track time for the bucket, so a chart can weigh plays by time. */
      listeningMs: Schema.Finite,
    }),
  ),
  trendUnit: Schema.Literals(["day", "month"]),
  topTracks: Schema.Array(TopTrack),
  topArtists: Schema.Array(TopArtist),
  /** Tracks heard exactly once: your long tail. */
  onePlayTracks: Schema.Finite,
  /** Listens between 22:00 and 05:00 local time. */
  lateNightListens: Schema.Finite,
  busiestDay: Schema.NullOr(
    Schema.Struct({ date: Schema.String, listens: Schema.Finite }),
  ),
});

export type ListeningInsights = typeof ListeningInsights.Type;

export const WeeklyInsights = Schema.Struct({
  weekStart: Schema.String,
  weekEnd: Schema.String,
  isPartial: Schema.Boolean,
  insights: ListeningInsights,
});

export type WeeklyInsights = typeof WeeklyInsights.Type;

const ExportedListen = Schema.Struct({
  id: Schema.String,
  playedAt: Schema.String,
  playedAtMs: Schema.Finite,
  trackId: Schema.String,
  trackName: Schema.String,
  artistNames: Schema.NullOr(Schema.String),
  albumName: Schema.NullOr(Schema.String),
  durationMs: Schema.NullOr(Schema.Finite),
  contextType: Schema.NullOr(Schema.String),
  contextUri: Schema.NullOr(Schema.String),
  externalUrl: Schema.NullOr(Schema.String),
});

/** Everything Spotistats stores about a user's listening history. */
export const ListeningExport = Schema.Struct({
  exportedAt: Schema.Finite,
  spotifyUserId: Schema.String,
  listenCount: Schema.Finite,
  listens: Schema.Array(ExportedListen),
});

export type ListeningExport = typeof ListeningExport.Type;

export type ExportedListen = typeof ExportedListen.Type;

/** A CSV response is sent as text so a large export never becomes a JSON tree. */
const Csv = HttpApiSchema.asText({ contentType: "text/csv; charset=utf-8" })(
  Schema.String,
);

/**
 * An upstream dependency (Spotify or the database) rejected or failed a call.
 * The client receives this as a typed 502 instead of a generic 500.
 */
export class UpstreamError extends Schema.TaggedError<UpstreamError, { readonly brand: unique symbol }>()(
  "UpstreamError",
  {
    service: Schema.String,
    message: Schema.String,
    /** The HTTP status the upstream returned, when there was one. */
    status: Schema.NullOr(Schema.Finite),
    /** Spotify's `Retry-After`, in milliseconds, when it asked us to wait. */
    retryAfterMs: Schema.optional(Schema.Finite),
  },
) {}

const trackingErrors = [
  HttpApiError.Unauthorized,
  HttpApiSchema.status(502)(UpstreamError),
] as const;

const weeklyErrors = [
  ...trackingErrors,
  HttpApiError.Forbidden,
  HttpApiError.BadRequest,
] as const;

const WeekStart = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
);

const bearer = { authorization: Schema.optional(Schema.String) } as const;

const del = HttpApiEndpoint.make("DELETE");

export const AccountGroup = HttpApiGroup.make("account").add(
  HttpApiEndpoint.get("discoveryHistory", "/api/account/discovery", {
    headers: bearer,
    success: DiscoveryHistory,
    error: trackingErrors,
  }),
  HttpApiEndpoint.post("discoveryKnown", "/api/account/discovery/known", {
    headers: bearer,
    payload: Schema.Struct({ ids: Schema.Array(Schema.String.check(Schema.isMaxLength(128))).check(Schema.isMaxLength(200)) }),
    success: Schema.Array(Schema.String),
    error: trackingErrors,
  }),
  HttpApiEndpoint.get("status", "/api/account/stats", {
    headers: bearer,
    success: TrackingStatus,
    error: trackingErrors,
  }),
  HttpApiEndpoint.get("weeklyAccess", "/api/account/stats/weeks/access", {
    headers: bearer,
    success: WeeklyAccess,
    error: trackingErrors,
  }),
  HttpApiEndpoint.get("weeklyHistory", "/api/account/stats/weeks", {
    headers: bearer,
    query: {
      tzOffset: Schema.optional(Schema.FiniteFromString),
      page: Schema.optional(Schema.FiniteFromString),
      limit: Schema.optional(Schema.FiniteFromString),
    },
    success: WeeklyHistory,
    error: weeklyErrors,
  }),
  HttpApiEndpoint.get("weeklyInsights", "/api/account/stats/weeks/:weekStart", {
    headers: bearer,
    params: { weekStart: WeekStart },
    query: {
      tzOffset: Schema.optional(Schema.FiniteFromString),
    },
    success: WeeklyInsights,
    error: weeklyErrors,
  }),
  HttpApiEndpoint.get("insights", "/api/account/stats/insights", {
    headers: bearer,
    query: {
      tzOffset: Schema.optional(Schema.FiniteFromString),
      range: Schema.optional(InsightsRange),
      fromMs: Schema.optional(Schema.FiniteFromString),
      toMs: Schema.optional(Schema.FiniteFromString),
    },
    success: ListeningInsights,
    error: trackingErrors,
  }),
  HttpApiEndpoint.get("exportJson", "/api/account/stats/export/json", {
    headers: bearer,
    success: ListeningExport,
    error: trackingErrors,
  }),
  HttpApiEndpoint.get("exportCsv", "/api/account/stats/export/csv", {
    headers: bearer,
    success: Csv,
    error: trackingErrors,
  }),
  HttpApiEndpoint.post("refresh", "/api/account/stats/refresh", {
    headers: bearer,
    success: RefreshResult,
    error: trackingErrors,
  }),
  del("disable", "/api/account/stats", {
    headers: bearer,
    success: TrackingStatus,
    error: trackingErrors,
  }),
  del("deleteData", "/api/account/stats/all", {
    headers: bearer,
    success: TrackingStatus,
    error: trackingErrors,
  }),
);

export const Api = HttpApi.make("spotistats").add(AccountGroup);

export type Api = typeof Api;
