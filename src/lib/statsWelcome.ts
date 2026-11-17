/**
 * The states a freshly connected stats account moves through on the profile.
 *
 * Sync is asynchronous: the OAuth callback only stores the token and queues a
 * job, so the first listens arrive a moment later. Rather than show a page of
 * zeros and hope the user waits, the profile watches for them and tells the
 * story of the sync as it happens.
 */
export type WelcomePhase =
  /** No status has arrived yet, so nothing is known about the account. */
  | "connecting"
  /** The account is enabled and the first sync is still in flight. */
  | "syncing"
  /** Listens are stored, so the insights below are real. */
  | "ready"
  /** The sync completed but Spotify had no recent plays to import. */
  | "empty"
  /** Nothing landed inside the polling window; the cron will retry. */
  | "slow"
  /** The very first sync failed and nothing is stored yet. */
  | "failed";

export interface WelcomeInput {
  /** Whether a status response has been read at all. */
  seenStatus: boolean;
  listenCount: number;
  lastSuccessAt: number | null;
  lastError: string | null;
  /** How many status polls have run since the connection landed. */
  polls: number;
  /** How many polls to wait before giving up on the instant path. */
  pollLimit: number;
}

/** Which chapter of the first sync the profile should show. */
export function welcomePhase(input: WelcomeInput): WelcomePhase {
  // Stored listens settle every other question: the feature is working.
  if (input.listenCount > 0) return "ready";

  if (!input.seenStatus) return "connecting";

  // A failure before the first success is the only failure worth reporting;
  // later ones leave earlier plays in place, so the feature still works.
  if (input.lastError !== null && input.lastSuccessAt === null) return "failed";

  if (input.polls >= input.pollLimit) {
    // A completed sync with nothing imported is Spotify's answer, not a delay.
    return input.lastSuccessAt !== null ? "empty" : "slow";
  }

  return "syncing";
}

/** The three steps the welcome panel draws, and how far each has got. */
export function welcomeSteps(
  phase: WelcomePhase,
): ReadonlyArray<{ label: string; state: "done" | "active" | "todo" }> {
  const importing =
    phase === "ready"
      ? "done"
      : phase === "connecting" || phase === "syncing"
        ? "active"
        : "todo";

  return [
    { label: "Spotify connected", state: "done" },
    { label: "Importing recent plays", state: importing },
    {
      label: "Your insights",
      state: phase === "ready" ? "active" : "todo",
    },
  ];
}
