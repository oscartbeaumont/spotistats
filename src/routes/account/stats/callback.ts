import type { APIEvent } from "@solidjs/start/server";
import { assertTrackingBindings, clearCookie, enableTracking, exchangeTrackingCode, parseCookie } from "~/lib/server/spotify-tracking";

function failedLocation(reason: string) {
  return `/account?stats=failed&reason=${encodeURIComponent(reason)}`;
}

export async function GET(event: APIEvent) {
  try {
    assertTrackingBindings();
  } catch (error) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: failedLocation(error instanceof Error ? error.message : String(error)),
        "Set-Cookie": clearCookie("spotify_stats_state"),
      },
    });
  }

  const url = new URL(event.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = parseCookie(event.request, "spotify_stats_state");
  const spotifyError = url.searchParams.get("error");

  if (spotifyError) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: failedLocation(spotifyError),
        "Set-Cookie": clearCookie("spotify_stats_state"),
      },
    });
  }

  if (!code || !state || state !== expectedState) {
    const reason = !code ? "missing_code" : !state ? "missing_state" : !expectedState ? "missing_state_cookie" : "state_mismatch";
    return new Response(null, {
      status: 302,
      headers: {
        Location: failedLocation(reason),
        "Set-Cookie": clearCookie("spotify_stats_state"),
      },
    });
  }

  try {
    const token = await exchangeTrackingCode(event.request, code);
    await enableTracking(token);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/account?stats=enabled",
        "Set-Cookie": clearCookie("spotify_stats_state"),
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(null, {
      status: 302,
      headers: {
        Location: failedLocation(error instanceof Error ? error.message : String(error)),
        "Set-Cookie": clearCookie("spotify_stats_state"),
      },
    });
  }
}
