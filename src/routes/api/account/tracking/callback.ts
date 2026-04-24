import type { APIEvent } from "@solidjs/start/server";
import { clearCookie, enableTracking, exchangeTrackingCode, getTrackingEnv, json, parseCookie } from "~/lib/server/spotify-tracking";

export async function GET(event: APIEvent) {
  const env = getTrackingEnv();
  if (!env) return json({ error: "Cloudflare environment is unavailable" }, { status: 500 });

  const url = new URL(event.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = parseCookie(event.request, "spotify_tracking_state");

  if (!code || !state || state !== expectedState) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/account?tracking=failed",
        "Set-Cookie": clearCookie("spotify_tracking_state"),
      },
    });
  }

  try {
    const token = await exchangeTrackingCode(env, event.request, code);
    await enableTracking(env, token);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/account?tracking=enabled",
        "Set-Cookie": clearCookie("spotify_tracking_state"),
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/account?tracking=failed",
        "Set-Cookie": clearCookie("spotify_tracking_state"),
      },
    });
  }
}
