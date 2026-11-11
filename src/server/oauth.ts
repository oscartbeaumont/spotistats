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

/** How long the browser may sit on Spotify's consent screen before the handshake expires. */
const stateLifetimeMs = 10 * 60 * 1000;

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const randomState = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

/** Compares two hex strings without leaking where they first differ. */
const stateMatches = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

/**
 * Signs the OAuth state instead of storing it in a cookie.
 *
 * The state cookie was dropped before the callback on iOS Safari, which failed
 * the setup with `missing_state_cookie` even though Spotify had authorised the
 * account. A signature needs no browser storage, so the handshake survives
 * cookie blocking, ITP and the redirect through Spotify's consent page.
 *
 * The payload is a random nonce plus an issue time; the HMAC uses the client
 * secret that is already required to exchange the code, so no new secret or
 * table is involved.
 */
const signState = async (payload: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SPOTIFY_CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return toHex(new Uint8Array(signature));
};

export const createState = async () => {
  const payload = `${randomState()}.${Date.now().toString(36)}`;
  return `${payload}.${await signState(payload)}`;
};

/** Whether `state` was minted by this worker and is still inside its window. */
export const stateIsValid = async (state: string) => {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, issuedAt, signature] = parts;
  if (!nonce || !issuedAt || !signature) return false;
  const issued = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(issued)) return false;
  const age = Date.now() - issued;
  if (age < 0 || age > stateLifetimeMs) return false;
  return stateMatches(signature, await signState(`${nonce}.${issuedAt}`));
};

const originFromRequest = (request: Request) => {
  const url = new URL(request.url);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
};

const redirectUri = (request: Request) =>
  `${originFromRequest(request)}/account/stats/callback`;

const failed = (reason: string, detail?: string) => {
  // Log for the worker console, and carry a short machine code in the URL so
  // the account page can report *why* the setup failed to PostHog. Only these
  // fixed codes are ever sent; the raw cause stays in the log.
  console.warn(
    `Spotify stats setup failed: ${reason}${detail ? ` (${detail})` : ""}`,
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/account?stats=failed&reason=${encodeURIComponent(reason)}`,
    },
  });
};

/**
 * Maps the `error` code on Spotify's redirect to the reason the account page
 * shows. Spotify uses the same parameter for a user who cancels the consent
 * screen and for a genuine failure, so they must not share a code: a
 * cancellation is an expected outcome, while everything else is worth
 * reporting. Only these fixed reasons reach the URL.
 */
const spotifyErrorReasons: Record<string, string> = {
  access_denied: "spotify_denied",
  server_error: "spotify_unavailable",
  temporarily_unavailable: "spotify_unavailable",
};

export const spotifyErrorReason = (error: string): string =>
  spotifyErrorReasons[error] ?? "spotify_rejected";

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
 * Redirect through the canonical origin before handing the browser to Spotify,
 * so the registered redirect URI is always the host the worker answers as. The
 * legacy `spotistats.js.org` alias redirects to this host at the edge, and
 * `localhost` becomes `127.0.0.1` for the development redirect URI. The state
 * itself is signed rather than host-scoped, so this hop is only about the
 * redirect URI.
 */
export async function statsLogin(request: Request): Promise<Response> {
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

  const params = new URLSearchParams({
    client_id: env.VITE_SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(request),
    state: await createState(),
    scope: statsScopes.join(" "),
    show_dialog: "true",
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.spotify.com/authorize?${params.toString()}`,
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
    if (spotifyError) {
      return failed(
        spotifyErrorReason(spotifyError),
        `Spotify returned ${spotifyError}`,
      );
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) return failed("missing_code");
    if (!state) return failed("missing_state");
    if (!(yield* Effect.promise(() => stateIsValid(state)))) {
      return failed("invalid_state");
    }

    const token = yield* spotify.exchangeCode(code, redirectUri(request));
    const profile = yield* spotify.profile(token.access_token);
    yield* tracking.enable(profile, token);

    return new Response(null, {
      status: 302,
      headers: { Location: "/account?stats=enabled" },
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
