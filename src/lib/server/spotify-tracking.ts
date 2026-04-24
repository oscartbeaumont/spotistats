import type { APIEvent } from "@solidjs/start/server";
import { env as cloudflareEnv } from "cloudflare:workers";

export type SpotifySyncMessage = { spotifyUserId: string };

type TrackingEnv = Env & {
  DB: D1Database;
  SPOTIFY_SYNC_QUEUE: Queue<SpotifySyncMessage>;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
};

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

export function getTrackingEnv() {
  return cloudflareEnv as TrackingEnv;
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
  const value = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
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
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function originFromRequest(request: Request) {
  const url = new URL(request.url);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
}

export function trackingRedirectUri(request: Request) {
  return `${originFromRequest(request)}/api/account/tracking/callback`;
}

function basicAuth(env: TrackingEnv) {
  return btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
}

async function spotifyTokenRequest(env: TrackingEnv, body: URLSearchParams) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(env)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Spotify token request failed: ${res.status} ${await res.text()}`);
  return await res.json<SpotifyToken>();
}

export async function exchangeTrackingCode(env: TrackingEnv, request: Request, code: string) {
  return await spotifyTokenRequest(env, new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: trackingRedirectUri(request),
  }));
}

async function refreshAccessToken(env: TrackingEnv, spotifyUserId: string) {
  const row = await env.DB.prepare("select refresh_token from spotify_tokens where spotify_user_id = ?")
    .bind(spotifyUserId)
    .first<{ refresh_token: string }>();
  if (!row) throw new Error(`No refresh token for ${spotifyUserId}`);

  const token = await spotifyTokenRequest(env, new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  }));

  if (token.refresh_token) {
    await env.DB.prepare("update spotify_tokens set refresh_token = ?, scope = ?, updated_at = ? where spotify_user_id = ?")
      .bind(token.refresh_token, token.scope, Date.now(), spotifyUserId)
      .run();
  }

  return token.access_token;
}

async function spotifyFetch<T>(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "60");
    const error = new Error("Spotify rate limited request") as Error & { retryAfter?: number };
    error.retryAfter = retryAfter;
    throw error;
  }

  if (!res.ok) throw new Error(`Spotify API failed: ${res.status} ${await res.text()}`);
  return await res.json<T>();
}

export async function spotifyProfileFromAccessToken(accessToken: string) {
  return await spotifyFetch<SpotifyProfile>("https://api.spotify.com/v1/me", accessToken.replace(/^Bearer\s+/i, ""));
}

export async function enableTracking(env: TrackingEnv, token: SpotifyToken) {
  if (!token.refresh_token) throw new Error("Spotify did not return a refresh token");
  const profile = await spotifyProfileFromAccessToken(token.access_token);
  const now = Date.now();

  await env.DB.batch([
    env.DB.prepare(`
      insert into spotify_tracking_users (spotify_user_id, display_name, email, enabled, consented_at, disabled_at, created_at, updated_at)
      values (?, ?, ?, 1, ?, null, ?, ?)
      on conflict(spotify_user_id) do update set
        display_name = excluded.display_name,
        email = excluded.email,
        enabled = 1,
        consented_at = excluded.consented_at,
        disabled_at = null,
        updated_at = excluded.updated_at
    `).bind(profile.id, profile.display_name, profile.email ?? null, now, now, now),
    env.DB.prepare(`
      insert into spotify_tokens (spotify_user_id, refresh_token, scope, updated_at)
      values (?, ?, ?, ?)
      on conflict(spotify_user_id) do update set
        refresh_token = excluded.refresh_token,
        scope = excluded.scope,
        updated_at = excluded.updated_at
    `).bind(profile.id, token.refresh_token, token.scope, now),
    env.DB.prepare(`
      insert into spotify_sync_state (spotify_user_id, last_played_at_ms, last_success_at, last_error, next_sync_after, updated_at)
      values (?, null, null, null, 0, ?)
      on conflict(spotify_user_id) do update set
        last_error = null,
        next_sync_after = 0,
        updated_at = excluded.updated_at
    `).bind(profile.id, now),
  ]);

  await env.SPOTIFY_SYNC_QUEUE.send({ spotifyUserId: profile.id });
  return profile;
}

export async function disableTracking(env: TrackingEnv, spotifyUserId: string) {
  await env.DB.prepare("update spotify_tracking_users set enabled = 0, disabled_at = ?, updated_at = ? where spotify_user_id = ?")
    .bind(Date.now(), Date.now(), spotifyUserId)
    .run();
}

export async function enqueueDueTrackingUsers(env: TrackingEnv, limit = 100) {
  const now = Date.now();
  const rows = await env.DB.prepare(`
    select u.spotify_user_id
    from spotify_tracking_users u
    join spotify_sync_state s on s.spotify_user_id = u.spotify_user_id
    where u.enabled = 1 and s.next_sync_after <= ?
    order by s.next_sync_after asc
    limit ?
  `).bind(now, limit).all<{ spotify_user_id: string }>();

  if (!rows.results.length) return 0;
  await env.SPOTIFY_SYNC_QUEUE.sendBatch(rows.results.map(row => ({ body: { spotifyUserId: row.spotify_user_id } })));
  return rows.results.length;
}

function listenId(spotifyUserId: string, trackId: string, playedAtMs: number) {
  return `${spotifyUserId}:${trackId}:${playedAtMs}`;
}

export async function syncSpotifyUser(env: TrackingEnv, spotifyUserId: string) {
  const enabled = await env.DB.prepare("select enabled from spotify_tracking_users where spotify_user_id = ?")
    .bind(spotifyUserId)
    .first<{ enabled: number }>();
  if (!enabled?.enabled) return;

  try {
    const state = await env.DB.prepare("select last_played_at_ms from spotify_sync_state where spotify_user_id = ?")
      .bind(spotifyUserId)
      .first<{ last_played_at_ms: number | null }>();
    const accessToken = await refreshAccessToken(env, spotifyUserId);
    const url = new URL("https://api.spotify.com/v1/me/player/recently-played");
    url.searchParams.set("limit", "50");
    if (state?.last_played_at_ms) url.searchParams.set("after", String(state.last_played_at_ms));

    const data = await spotifyFetch<RecentlyPlayedResponse>(url.toString(), accessToken);
    const now = Date.now();
    let newest = state?.last_played_at_ms ?? null;
    const statements: D1PreparedStatement[] = [];

    for (const item of data.items) {
      if (!item.track.id) continue;
      const playedAtMs = Date.parse(item.played_at);
      if (!Number.isFinite(playedAtMs)) continue;
      newest = Math.max(newest ?? 0, playedAtMs);
      const image = item.track.album?.images?.[0]?.url ?? null;
      const artists = item.track.artists?.map(artist => artist.name).join(", ") ?? "";

      statements.push(env.DB.prepare(`
        insert into spotify_tracks (spotify_track_id, name, album_name, artist_names, duration_ms, uri, external_url, image_url, raw_json, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(spotify_track_id) do update set
          name = excluded.name,
          album_name = excluded.album_name,
          artist_names = excluded.artist_names,
          duration_ms = excluded.duration_ms,
          uri = excluded.uri,
          external_url = excluded.external_url,
          image_url = excluded.image_url,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
      `).bind(
        item.track.id,
        item.track.name,
        item.track.album?.name ?? null,
        artists,
        item.track.duration_ms,
        item.track.uri,
        item.track.external_urls?.spotify ?? null,
        image,
        JSON.stringify(item.track),
        now,
      ));

      statements.push(env.DB.prepare(`
        insert or ignore into spotify_listens (id, spotify_user_id, spotify_track_id, played_at, played_at_ms, context_type, context_uri, raw_json, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        listenId(spotifyUserId, item.track.id, playedAtMs),
        spotifyUserId,
        item.track.id,
        item.played_at,
        playedAtMs,
        item.context?.type ?? null,
        item.context?.uri ?? null,
        JSON.stringify(item),
        now,
      ));
    }

    statements.push(env.DB.prepare(`
      update spotify_sync_state
      set last_played_at_ms = coalesce(?, last_played_at_ms), last_success_at = ?, last_error = null, next_sync_after = ?, updated_at = ?
      where spotify_user_id = ?
    `).bind(newest, now, now + 15 * 60 * 1000, now, spotifyUserId));

    await env.DB.batch(statements);
  } catch (error) {
    const retryAfter = (error as Error & { retryAfter?: number }).retryAfter;
    const now = Date.now();
    await env.DB.prepare("update spotify_sync_state set last_error = ?, next_sync_after = ?, updated_at = ? where spotify_user_id = ?")
      .bind(String(error), now + (retryAfter ?? 15 * 60) * 1000, now, spotifyUserId)
      .run();
    if (!retryAfter) throw error;
  }
}

export async function trackingStatus(env: TrackingEnv, spotifyUserId: string) {
  const status = await env.DB.prepare(`
    select u.enabled, u.consented_at, u.disabled_at, s.last_played_at_ms, s.last_success_at, s.last_error
    from spotify_tracking_users u
    left join spotify_sync_state s on s.spotify_user_id = u.spotify_user_id
    where u.spotify_user_id = ?
  `).bind(spotifyUserId).first<{
    enabled: number;
    consented_at: number;
    disabled_at: number | null;
    last_played_at_ms: number | null;
    last_success_at: number | null;
    last_error: string | null;
  }>();

  const recent = await env.DB.prepare(`
    select l.played_at, l.played_at_ms, t.name, t.album_name, t.artist_names, t.image_url, t.external_url
    from spotify_listens l
    join spotify_tracks t on t.spotify_track_id = l.spotify_track_id
    where l.spotify_user_id = ?
    order by l.played_at_ms desc
    limit 5
  `).bind(spotifyUserId).all<{
    played_at: string;
    played_at_ms: number;
    name: string;
    album_name: string | null;
    artist_names: string | null;
    image_url: string | null;
    external_url: string | null;
  }>();

  return {
    enabled: !!status?.enabled,
    consentedAt: status?.consented_at ?? null,
    disabledAt: status?.disabled_at ?? null,
    lastPlayedAtMs: status?.last_played_at_ms ?? null,
    lastSuccessAt: status?.last_success_at ?? null,
    lastError: status?.last_error ?? null,
    recent: recent.results,
  };
}
