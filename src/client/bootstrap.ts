import { initAnalytics, identifyUser } from "./analytics";
import { consumeSpotifyCallback } from "./auth";
import { installChunkRecovery } from "./chunkRecovery";
import { initFeatureFlags } from "./features";
import { hydrateAuthStore } from "./storage";

/**
 * Client boot.
 *
 * Runs once after hydration: loads the persisted session, starts analytics,
 * and finishes a Spotify login callback if the URL carries one. The decoded
 * session is passed by value because Solid 2 setters do not update reads until
 * the next flush.
 */
export function bootstrapClient(): void {
  const session = hydrateAuthStore();
  initAnalytics();
  initFeatureFlags();
  // Re-identify from the cached profile so feature flags resolve for the
  // signed-in person on any route, not only after visiting the profile page.
  if (session.status === "authenticated" && session.profile?.id) {
    identifyUser(session.profile.id, {
      username: session.profile.displayName,
      email: session.profile.email,
    });
  }
  void consumeSpotifyCallback(session);
}

// Register as early as possible: a lazy route chunk can fail during the first
// render, before `bootstrapClient` runs. Guarded because this module is also
// evaluated during the server render.
if (typeof window !== "undefined") {
  try {
    installChunkRecovery(window, window.sessionStorage);
  } catch {
    // Blocked storage must not stop the app from booting.
  }
}
