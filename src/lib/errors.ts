export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
    if ("_tag" in error && typeof error._tag === "string") {
      return error._tag;
    }
  }
  return String(error);
}

/**
 * Turns the short reason codes the stats OAuth callback puts in the URL into
 * sentences a person can act on, so the account page never shows a raw token
 * like `missing_state_cookie`.
 */
const statsReasons: Record<string, string> = {
  spotify_denied: "you cancelled the Spotify permission prompt",
  missing_code: "Spotify did not return an authorization code",
  missing_state: "the sign-in response was missing its security state",
  missing_state_cookie:
    "your browser did not keep the sign-in cookie — enable cookies and try again",
  state_mismatch: "the sign-in response did not match this session",
  internal_error: "the server could not complete the Spotify sign-in",
};

export function describeStatsReason(reason: string | null): string {
  if (!reason) return "the Spotify sign-in did not complete";
  return statsReasons[reason] ?? `unexpected error (${reason})`;
}
