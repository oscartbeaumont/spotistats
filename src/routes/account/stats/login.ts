import type { APIEvent } from "@solidjs/start/server";
import { env } from "cloudflare:workers";
import { cookie, originFromRequest, randomState, trackingRedirectUri } from "~/lib/server/spotify-stats";

const scopes = ["user-read-email", "user-read-recently-played"];

export async function GET(event: APIEvent) {
  const requestUrl = new URL(event.request.url);
  const normalizedOrigin = originFromRequest(event.request);
  if (requestUrl.origin !== normalizedOrigin) {
    const normalizedUrl = new URL(event.request.url);
    const origin = new URL(normalizedOrigin);
    normalizedUrl.protocol = origin.protocol;
    normalizedUrl.hostname = origin.hostname;
    normalizedUrl.port = origin.port;
    return new Response(null, {
      status: 302,
      headers: { Location: normalizedUrl.toString() },
    });
  }

  const state = randomState();
  const params = new URLSearchParams({
    client_id: env.VITE_SPOTIFY_CLIENT_ID,
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
      "Set-Cookie": cookie("spotify_stats_state", state, 10 * 60),
    },
  });
}
