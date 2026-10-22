import { env } from "cloudflare:workers";
import { Effect } from "effect";

import { Spotify } from "./spotify";
import { Tracking } from "./tracking";

/**
 * Server-side OAuth for listening-stats sync.
 *
 * The browser only receives an authorization code; the client secret stays on
 * the worker, and the refresh token is stored server-side.
 */

const statsScopes = ["user-read-email", "user-read-recently-played"];
const stateCookie = "spotify_stats_state";

const cookie = (name: string, value: string, maxAgeSeconds: number) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

const clearCookie = (name: string) =>
  `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

const parseCookie = (request: Request, name: string) => {
  const header = request.headers.get("Cookie") ?? "";
  const value = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!value) return null;
  try {
    return decodeURIComponent(value.slice(name.length + 1));
  } catch {
    return null;
  }
};

const randomState = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const originFromRequest = (request: Request) => {
  const url = new URL(request.url);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
};

const redirectUri = (request: Request) =>
  `${originFromRequest(request)}/account/stats/callback`;

const failed = (reason: string) => {
  // The reason used to travel in the URL; keep it in the log instead so the
  // account page can hand the failure straight to the error boundary.
  console.warn(`Spotify stats setup failed: ${reason}`);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/account?stats=failed",
      "Set-Cookie": clearCookie(stateCookie),
    },
  });
};

/** Keeps the server log readable: the raw Cause nests the error too deep. */
const describeCause = (cause: unknown): string => {
  try {
    return JSON.stringify(cause, (_key, value) =>
      value instanceof Error ? { name: value.name, message: value.message } : value,
    );
  } catch {
    return String(cause);
  }
};

/**
 * Marks the hop through the canonical origin, so it is taken exactly once.
 */
const resumedParam = "resumed";

/**
 * Starts the listening-stats OAuth flow.
 *
 * The state cookie is host-scoped, and a browser stores it against the host it
 * requested, which is not always the host this worker answers as: the legacy
 * `spotistats.js.org` alias is proxied here with the canonical host already
 * rewritten, so `request.url` is `spotistats.otbeaumont.me` even for a browser
 * on `spotistats.js.org`. Spotify then returns to the canonical callback, where
 * the js.org cookie is not sent and the handshake dies with
 * `missing_state_cookie`. Redirect through the canonical origin before setting
 * anything, so the browser stores the state against the host Spotify returns
 * to. The host is normalised at the same time, so `localhost` becomes
 * `127.0.0.1` for the registered development redirect URI.
 */
export function statsLogin(request: Request): Response {
  const requestUrl = new URL(request.url);
  const normalized = new URL(originFromRequest(request));
  const canonical = new URL(requestUrl.toString());
  canonical.protocol = normalized.protocol;
  canonical.hostname = normalized.hostname;
  canonical.port = normalized.port;
  canonical.searchParams.set(resumedParam, "1");

  if (canonical.toString() !== requestUrl.toString()) {
    return new Response(null, {
      status: 302,
      headers: { Location: canonical.toString() },
    });
  }

  const state = randomState();
  const params = new URLSearchParams({
    client_id: env.VITE_SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(request),
    state,
    scope: statsScopes.join(" "),
    show_dialog: "true",
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.spotify.com/authorize?${params.toString()}`,
      "Set-Cookie": cookie(stateCookie, state, 10 * 60),
    },
  });
}

export function statsCallback(
  request: Request,
): Effect.Effect<Response, never, Spotify | Tracking> {
  return Effect.gen(function* () {
    const url = new URL(request.url);
    const spotify = yield* Spotify;
    const tracking = yield* Tracking;

    const spotifyError = url.searchParams.get("error");
    if (spotifyError) return failed("spotify_denied");

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = parseCookie(request, stateCookie);
    if (!code || !state || !expectedState || state !== expectedState) {
      const reason = !code
        ? "missing_code"
        : !state
          ? "missing_state"
          : !expectedState
            ? "missing_state_cookie"
            : "state_mismatch";
      return failed(reason);
    }

    const token = yield* spotify.exchangeCode(code, redirectUri(request));
    const profile = yield* spotify.profile(token.access_token);
    yield* tracking.enable(profile, token);

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/account?stats=enabled",
        "Set-Cookie": clearCookie(stateCookie),
      },
    });
  }).pipe(
    Effect.catchCause((cause) => {
      const detail = describeCause(cause);
      // Spotify reports bad client credentials as `invalid_client`; surface it
      // as a distinct reason so the account page can point at the secret.
      const reason = detail.includes("invalid_client")
        ? "spotify_credentials"
        : "internal_error";
      return Effect.sync(() =>
        console.error("Spotify stats callback failed", detail),
      ).pipe(Effect.as(failed(reason)));
    }),
  );
}
