import { env } from "cloudflare:workers";
import { and, desc, eq, lte } from "drizzle-orm";

import { db, schema } from "./db";

export type SpotifySyncMessage = { spotifyUserId: string };

type SpotifyProfile = {
  id: string;
  display_name: string | null;
  email?: string;
};

type SpotifyToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

type RecentlyPlayedResponse = {
  items: PlayHistory[];
};

type PlayHistory = {
  played_at: string;
  context: { type?: string; uri?: string } | null;
  track: {
    id: string | null;
    name: string;
    duration_ms: number;
    uri: string;
    external_urls?: { spotify?: string };
    album?: { name?: string; images?: { url: string }[] };
    artists?: { name: string }[];
  };
};

export function assertTrackingBindings() {
  console.log("DEBUG", env, env.DB);
  if (!env.DB)
    throw new Error(
      "Missing Cloudflare D1 binding DB. Run this through wrangler dev/preview or deploy to Cloudflare.",
    );
  if (!env.SPOTIFY_SYNC_QUEUE)
    throw new Error(
      "Missing Cloudflare Queue binding SPOTIFY_SYNC_QUEUE. Run this through wrangler dev/preview or deploy to Cloudflare.",
    );
  if (!env.SPOTIFY_CLIENT_SECRET)
    throw new Error("Missing SPOTIFY_CLIENT_SECRET secret.");
}

export function assertTrackingReadBindings() {
  if (!env.DB)
    throw new Error(
      "Missing Cloudflare D1 binding DB. Run this through wrangler dev/preview or deploy to Cloudflare.",
    );
}

export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export function parseCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
}

export function cookie(name: string, value: string, maxAgeSeconds: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearCookie(name: string) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function originFromRequest(request: Request) {
  const url = new URL(request.url);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
}

export function trackingRedirectUri(request: Request) {
  return `${originFromRequest(request)}/api/account/tracking/callback`;
}

function basicAuth() {
  return btoa(`${env.VITE_SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
}

async function spotifyTokenRequest(body: URLSearchParams) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok)
    throw new Error(
      `Spotify token request failed: ${res.status} ${await res.text()}`,
    );
  return await res.json<SpotifyToken>();
}

export async function exchangeTrackingCode(request: Request, code: string) {
  return await spotifyTokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: trackingRedirectUri(request),
    }),
  );
}

async function refreshAccessToken(spotifyUserId: string) {
  const database = db(env.DB);
  const row = await database.query.spotifyTokens.findFirst({
    columns: { refreshToken: true },
    where: eq(schema.spotifyTokens.spotifyUserId, spotifyUserId),
  });
  if (!row) throw new Error(`No refresh token for ${spotifyUserId}`);

  const token = await spotifyTokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
    }),
  );

  if (token.refresh_token) {
    await database
      .update(schema.spotifyTokens)
      .set({
        refreshToken: token.refresh_token,
        scope: token.scope,
        updatedAt: Date.now(),
      })
      .where(eq(schema.spotifyTokens.spotifyUserId, spotifyUserId));
  }

  return token.access_token;
}

async function spotifyFetch<T>(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "60");
    const error = new Error("Spotify rate limited request") as Error & {
      retryAfter?: number;
    };
    error.retryAfter = retryAfter;
    throw error;
  }

  if (!res.ok)
    throw new Error(`Spotify API failed: ${res.status} ${await res.text()}`);
  return await res.json<T>();
}

export async function spotifyProfileFromAccessToken(accessToken: string) {
  return await spotifyFetch<SpotifyProfile>(
    "https://api.spotify.com/v1/me",
    accessToken.replace(/^Bearer\s+/i, ""),
  );
}

export async function enableTracking(token: SpotifyToken) {
  if (!token.refresh_token)
    throw new Error("Spotify did not return a refresh token");
  const profile = await spotifyProfileFromAccessToken(token.access_token);
  const now = Date.now();
  const database = db(env.DB);

  await database.batch([
    database
      .insert(schema.spotifyTrackingUsers)
      .values({
        spotifyUserId: profile.id,
        displayName: profile.display_name,
        email: profile.email ?? null,
        enabled: 1,
        consentedAt: now,
        disabledAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.spotifyTrackingUsers.spotifyUserId,
        set: {
          displayName: profile.display_name,
          email: profile.email ?? null,
          enabled: 1,
          consentedAt: now,
          disabledAt: null,
          updatedAt: now,
        },
      }),
    database
      .insert(schema.spotifyTokens)
      .values({
        spotifyUserId: profile.id,
        refreshToken: token.refresh_token,
        scope: token.scope,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.spotifyTokens.spotifyUserId,
        set: { refreshToken: token.refresh_token, scope: token.scope, updatedAt: now },
      }),
    database
      .insert(schema.spotifySyncState)
      .values({ spotifyUserId: profile.id, nextSyncAfter: 0, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.spotifySyncState.spotifyUserId,
        set: { lastError: null, nextSyncAfter: 0, updatedAt: now },
      }),
  ]);

  await env.SPOTIFY_SYNC_QUEUE.send({ spotifyUserId: profile.id });
  return profile;
}

export async function disableTracking(spotifyUserId: string) {
  const now = Date.now();
  await db(env.DB)
    .update(schema.spotifyTrackingUsers)
    .set({ enabled: 0, disabledAt: now, updatedAt: now })
    .where(eq(schema.spotifyTrackingUsers.spotifyUserId, spotifyUserId));
}

export async function enqueueDueTrackingUsers(limit = 100) {
  const now = Date.now();
  const database = db(env.DB);
  const rows = await database
    .select({ spotifyUserId: schema.spotifyTrackingUsers.spotifyUserId })
    .from(schema.spotifyTrackingUsers)
    .innerJoin(
      schema.spotifySyncState,
      eq(schema.spotifySyncState.spotifyUserId, schema.spotifyTrackingUsers.spotifyUserId),
    )
    .where(
      and(
        eq(schema.spotifyTrackingUsers.enabled, 1),
        lte(schema.spotifySyncState.nextSyncAfter, now),
      ),
    )
    .orderBy(schema.spotifySyncState.nextSyncAfter)
    .limit(limit);

  if (!rows.length) return 0;
  await env.SPOTIFY_SYNC_QUEUE.sendBatch(
    rows.map((row) => ({
      body: { spotifyUserId: row.spotifyUserId },
    })),
  );
  return rows.length;
}

function listenId(spotifyUserId: string, trackId: string, playedAtMs: number) {
  return `${spotifyUserId}:${trackId}:${playedAtMs}`;
}

export async function syncSpotifyUser(spotifyUserId: string) {
  const database = db(env.DB);
  const enabled = await database.query.spotifyTrackingUsers.findFirst({
    columns: { enabled: true },
    where: eq(schema.spotifyTrackingUsers.spotifyUserId, spotifyUserId),
  });
  if (!enabled?.enabled) return;

  try {
    const state = await database.query.spotifySyncState.findFirst({
      columns: { lastPlayedAtMs: true },
      where: eq(schema.spotifySyncState.spotifyUserId, spotifyUserId),
    });
    const accessToken = await refreshAccessToken(spotifyUserId);
    const url = new URL("https://api.spotify.com/v1/me/player/recently-played");
    url.searchParams.set("limit", "50");
    if (state?.lastPlayedAtMs)
      url.searchParams.set("after", String(state.lastPlayedAtMs));

    const data = await spotifyFetch<RecentlyPlayedResponse>(
      url.toString(),
      accessToken,
    );
    const now = Date.now();
    let newest = state?.lastPlayedAtMs ?? null;

    for (const item of data.items) {
      if (!item.track.id) continue;
      const playedAtMs = Date.parse(item.played_at);
      if (!Number.isFinite(playedAtMs)) continue;
      newest = Math.max(newest ?? 0, playedAtMs);
      const image = item.track.album?.images?.[0]?.url ?? null;
      const artists =
        item.track.artists?.map((artist) => artist.name).join(", ") ?? "";

      await database
        .insert(schema.spotifyTracks)
        .values({
          spotifyTrackId: item.track.id,
          name: item.track.name,
          albumName: item.track.album?.name ?? null,
          artistNames: artists,
          durationMs: item.track.duration_ms,
          uri: item.track.uri,
          externalUrl: item.track.external_urls?.spotify ?? null,
          imageUrl: image,
          rawJson: JSON.stringify(item.track),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.spotifyTracks.spotifyTrackId,
          set: {
            name: item.track.name,
            albumName: item.track.album?.name ?? null,
            artistNames: artists,
            durationMs: item.track.duration_ms,
            uri: item.track.uri,
            externalUrl: item.track.external_urls?.spotify ?? null,
            imageUrl: image,
            rawJson: JSON.stringify(item.track),
            updatedAt: now,
          },
        });

      await database
        .insert(schema.spotifyListens)
        .values({
          id: listenId(spotifyUserId, item.track.id, playedAtMs),
          spotifyUserId,
          spotifyTrackId: item.track.id,
          playedAt: item.played_at,
          playedAtMs,
          contextType: item.context?.type ?? null,
          contextUri: item.context?.uri ?? null,
          rawJson: JSON.stringify(item),
          createdAt: now,
        })
        .onConflictDoNothing();
    }

    await database
      .update(schema.spotifySyncState)
      .set({
        lastPlayedAtMs: newest ?? state?.lastPlayedAtMs ?? null,
        lastSuccessAt: now,
        lastError: null,
        nextSyncAfter: now + 15 * 60 * 1000,
        updatedAt: now,
      })
      .where(eq(schema.spotifySyncState.spotifyUserId, spotifyUserId));
  } catch (error) {
    const retryAfter = (error as Error & { retryAfter?: number }).retryAfter;
    const now = Date.now();
    await database
      .update(schema.spotifySyncState)
      .set({
        lastError: String(error),
        nextSyncAfter: now + (retryAfter ?? 15 * 60) * 1000,
        updatedAt: now,
      })
      .where(eq(schema.spotifySyncState.spotifyUserId, spotifyUserId));
    if (!retryAfter) throw error;
  }
}

export async function trackingStatus(spotifyUserId: string) {
  const database = db(env.DB);
  const [status] = await database
    .select({
      enabled: schema.spotifyTrackingUsers.enabled,
      consentedAt: schema.spotifyTrackingUsers.consentedAt,
      disabledAt: schema.spotifyTrackingUsers.disabledAt,
      lastPlayedAtMs: schema.spotifySyncState.lastPlayedAtMs,
      lastSuccessAt: schema.spotifySyncState.lastSuccessAt,
      lastError: schema.spotifySyncState.lastError,
    })
    .from(schema.spotifyTrackingUsers)
    .leftJoin(
      schema.spotifySyncState,
      eq(schema.spotifySyncState.spotifyUserId, schema.spotifyTrackingUsers.spotifyUserId),
    )
    .where(eq(schema.spotifyTrackingUsers.spotifyUserId, spotifyUserId))
    .limit(1);

  const recent = await database
    .select({
      played_at: schema.spotifyListens.playedAt,
      played_at_ms: schema.spotifyListens.playedAtMs,
      name: schema.spotifyTracks.name,
      album_name: schema.spotifyTracks.albumName,
      artist_names: schema.spotifyTracks.artistNames,
      image_url: schema.spotifyTracks.imageUrl,
      external_url: schema.spotifyTracks.externalUrl,
    })
    .from(schema.spotifyListens)
    .innerJoin(
      schema.spotifyTracks,
      eq(schema.spotifyTracks.spotifyTrackId, schema.spotifyListens.spotifyTrackId),
    )
    .where(eq(schema.spotifyListens.spotifyUserId, spotifyUserId))
    .orderBy(desc(schema.spotifyListens.playedAtMs))
    .limit(5);

  return {
    enabled: !!status?.enabled,
    consentedAt: status?.consentedAt ?? null,
    disabledAt: status?.disabledAt ?? null,
    lastPlayedAtMs: status?.lastPlayedAtMs ?? null,
    lastSuccessAt: status?.lastSuccessAt ?? null,
    lastError: status?.lastError ?? null,
    recent,
  };
}
