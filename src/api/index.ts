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
