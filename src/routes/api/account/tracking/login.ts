import type { APIEvent } from "@solidjs/start/server";
import { cookie, getTrackingEnv, json, randomState, trackingRedirectUri } from "~/lib/server/spotify-tracking";

const scopes = [
  "user-read-email",
  "user-read-recently-played",
];

export async function GET(event: APIEvent) {
  const env = getTrackingEnv();
  if (!env) return json({ error: "Cloudflare environment is unavailable" }, { status: 500 });

  const state = randomState();
  const params = new URLSearchParams({
    client_id: env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: trackingRedirectUri(event.request),
    state,
    scope: scopes.join(" "),
    show_dialog: "true",
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.spotify.com/authorize?${params.toString()}`,
      "Set-Cookie": cookie("spotify_tracking_state", state, 10 * 60),
    },
  });
}
