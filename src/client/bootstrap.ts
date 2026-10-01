import { initAnalytics } from "./analytics";
import { consumeSpotifyCallback } from "./auth";
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
  void consumeSpotifyCallback(session);
}
