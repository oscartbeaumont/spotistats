import type { APIEvent } from "@solidjs/start/server";
import { disableTracking, getTrackingEnv, json, spotifyProfileFromAccessToken, trackingStatus } from "~/lib/server/spotify-tracking";

async function currentSpotifyUserId(event: APIEvent) {
  const auth = event.request.headers.get("Authorization");
  if (!auth) return null;
  const profile = await spotifyProfileFromAccessToken(auth);
  return profile.id;
}

export async function GET(event: APIEvent) {
  const env = getTrackingEnv();
  if (!env) return json({ error: "Cloudflare environment is unavailable" }, { status: 500 });

  const spotifyUserId = await currentSpotifyUserId(event).catch(() => null);
  if (!spotifyUserId) return json({ error: "Unauthorized" }, { status: 401 });

  return json(await trackingStatus(env, spotifyUserId));
}

export async function DELETE(event: APIEvent) {
  const env = getTrackingEnv();
  if (!env) return json({ error: "Cloudflare environment is unavailable" }, { status: 500 });

  const spotifyUserId = await currentSpotifyUserId(event).catch(() => null);
  if (!spotifyUserId) return json({ error: "Unauthorized" }, { status: 401 });

  await disableTracking(env, spotifyUserId);
  return json(await trackingStatus(env, spotifyUserId));
}
