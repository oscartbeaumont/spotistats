import type { APIEvent } from "@solidjs/start/server";
import { waitUntil } from "cloudflare:workers";
import { deleteAccountData, disableTracking, enqueueSpotifyUserStatsRefresh, json, markStatsRead, spotifyProfileFromAccessToken, trackingStatus } from "~/lib/server/spotify-stats";

async function currentSpotifyUserId(event: APIEvent) {
  const auth = event.request.headers.get("Authorization");
  if (!auth) return null;
  const profile = await spotifyProfileFromAccessToken(auth);
  return profile.id;
}

export async function GET(event: APIEvent) {
  const spotifyUserId = await currentSpotifyUserId(event).catch(() => null);
  if (!spotifyUserId) return json({ error: "Unauthorized" }, { status: 401 });

  waitUntil(markStatsRead(spotifyUserId));
  return json(await trackingStatus(spotifyUserId));
}

export async function DELETE(event: APIEvent) {
  const spotifyUserId = await currentSpotifyUserId(event).catch(() => null);
  if (!spotifyUserId) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(event.request.url);
  if (url.searchParams.get("all") === "1") {
    await deleteAccountData(spotifyUserId);
    return json(await trackingStatus(spotifyUserId));
  }

  await disableTracking(spotifyUserId);
  return json(await trackingStatus(spotifyUserId));
}

export async function POST(event: APIEvent) {
  const spotifyUserId = await currentSpotifyUserId(event).catch(() => null);
  if (!spotifyUserId) return json({ error: "Unauthorized" }, { status: 401 });

  const queued = await enqueueSpotifyUserStatsRefresh(spotifyUserId);
  return json({ queued });
}
