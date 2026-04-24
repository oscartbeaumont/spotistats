import type { APIEvent } from "@solidjs/start/server";
import { assertTrackingReadBindings, disableTracking, json, spotifyProfileFromAccessToken, trackingStatus } from "~/lib/server/spotify-tracking";

async function currentSpotifyUserId(event: APIEvent) {
  const auth = event.request.headers.get("Authorization");
  if (!auth) return null;
  const profile = await spotifyProfileFromAccessToken(auth);
  return profile.id;
}

export async function GET(event: APIEvent) {
  try {
    assertTrackingReadBindings();
  } catch (error) {
    return json({ error: String(error) }, { status: 503 });
  }

  const spotifyUserId = await currentSpotifyUserId(event).catch(() => null);
  if (!spotifyUserId) return json({ error: "Unauthorized" }, { status: 401 });

  return json(await trackingStatus(spotifyUserId));
}

export async function DELETE(event: APIEvent) {
  try {
    assertTrackingReadBindings();
  } catch (error) {
    return json({ error: String(error) }, { status: 503 });
  }

  const spotifyUserId = await currentSpotifyUserId(event).catch(() => null);
  if (!spotifyUserId) return json({ error: "Unauthorized" }, { status: 401 });

  await disableTracking(spotifyUserId);
  return json(await trackingStatus(spotifyUserId));
}
