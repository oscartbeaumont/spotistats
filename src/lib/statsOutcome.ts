/**
 * The one-shot result the stats OAuth callback puts in the query string.
 *
 * `denied` is kept apart from `failed`: Spotify sends `access_denied` when the
 * user closes its consent screen, which is an expected outcome, while every
 * other reason names a setup failure worth reporting.
 */
export type StatsOutcome =
  | { kind: "enabled" }
  | { kind: "denied" }
  | { kind: "failed"; reason: string | null };

/** Reads the stats handshake outcome from a query string, or `null` if none. */
export function statsOutcome(search: string): StatsOutcome | null {
  const params = new URLSearchParams(search);
  if (params.get("stats") === "enabled") return { kind: "enabled" };
  if (params.get("stats") !== "failed") return null;
  const reason = params.get("reason");
  return reason === "spotify_denied"
    ? { kind: "denied" }
    : { kind: "failed", reason };
}
