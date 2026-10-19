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
  playedAtMs: Schema.Number,
  name: Schema.String,
  albumName: Schema.NullOr(Schema.String),
  artistNames: Schema.NullOr(Schema.String),
  imageUrl: Schema.NullOr(Schema.String),
  externalUrl: Schema.NullOr(Schema.String),
});

export const TrackingStatus = Schema.Struct({
  enabled: Schema.Boolean,
  consentedAt: Schema.NullOr(Schema.Number),
  lastReadAt: Schema.NullOr(Schema.Number),
  disabledAt: Schema.NullOr(Schema.Number),
  lastPlayedAtMs: Schema.NullOr(Schema.Number),
  lastSuccessAt: Schema.NullOr(Schema.Number),
  lastError: Schema.NullOr(Schema.String),
  listenCount: Schema.Number,
  recent: Schema.Array(RecentListen),
});
export type TrackingStatus = typeof TrackingStatus.Type;

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
  listens: Schema.Number,
});

const TopArtist = Schema.Struct({
  name: Schema.String,
  listens: Schema.Number,
  tracks: Schema.Number,
});

/**
 * Aggregates derived from the listens Spotistats collected itself. Spotify
 * only exposes a short recently-played window, so these are the numbers that
 * can only come from keeping history server-side.
 */
export const ListeningInsights = Schema.Struct({
  generatedAt: Schema.Number,
  totals: Schema.Struct({
    listens: Schema.Number,
    tracks: Schema.Number,
    artists: Schema.Number,
    listeningMs: Schema.Number,
    activeDays: Schema.Number,
    firstPlayedAtMs: Schema.NullOr(Schema.Number),
    lastPlayedAtMs: Schema.NullOr(Schema.Number),
  }),
  streak: Schema.Struct({
    current: Schema.Number,
    longest: Schema.Number,
    longestEndedOn: Schema.NullOr(Schema.String),
  }),
  /** Listens per local hour of day, index 0 is midnight. */
  hours: Schema.Array(Schema.Number),
  /** Listens per local weekday, index 0 is Monday. */
  weekdays: Schema.Array(Schema.Number),
  months: Schema.Array(
    Schema.Struct({ month: Schema.String, listens: Schema.Number }),
  ),
  topTracks: Schema.Array(TopTrack),
  topArtists: Schema.Array(TopArtist),
  /** Tracks heard exactly once: your long tail. */
  onePlayTracks: Schema.Number,
  /** Listens between 22:00 and 05:00 local time. */
  lateNightListens: Schema.Number,
  busiestDay: Schema.NullOr(
    Schema.Struct({ date: Schema.String, listens: Schema.Number }),
  ),
});
export type ListeningInsights = typeof ListeningInsights.Type;

const ExportedListen = Schema.Struct({
  id: Schema.String,
  playedAt: Schema.String,
  playedAtMs: Schema.Number,
  trackId: Schema.String,
  trackName: Schema.String,
  artistNames: Schema.NullOr(Schema.String),
  albumName: Schema.NullOr(Schema.String),
  durationMs: Schema.NullOr(Schema.Number),
  contextType: Schema.NullOr(Schema.String),
  contextUri: Schema.NullOr(Schema.String),
  externalUrl: Schema.NullOr(Schema.String),
});

/** Everything Spotistats stores about a user's listening history. */
export const ListeningExport = Schema.Struct({
  exportedAt: Schema.Number,
  spotifyUserId: Schema.String,
  listenCount: Schema.Number,
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
export class UpstreamError extends Schema.TaggedError<UpstreamError>()(
  "UpstreamError",
  {
    service: Schema.String,
    message: Schema.String,
    /** The HTTP status the upstream returned, when there was one. */
    status: Schema.NullOr(Schema.Number),
  },
) {}

const trackingErrors = [
  HttpApiError.Unauthorized,
  HttpApiSchema.status(502)(UpstreamError),
] as const;

const bearer = { authorization: Schema.optional(Schema.String) } as const;

const del = HttpApiEndpoint.make("DELETE");

export const AccountGroup = HttpApiGroup.make("account").add(
  HttpApiEndpoint.get("status", "/api/account/stats", {
    headers: bearer,
    success: TrackingStatus,
    error: trackingErrors,
  }),
  HttpApiEndpoint.get("insights", "/api/account/stats/insights", {
    headers: bearer,
    query: { tzOffset: Schema.optional(Schema.NumberFromString) },
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
