import { initAnalytics } from "./analytics";
import { consumeSpotifyCallback } from "./auth";
import { hydrateAuthStore } from "./storage";

/**
 * Client boot.
 *
 * Runs once after hydration: loads the persisted session, starts analytics,
 * and finishes a Spotify login callback if the URL carries one.
 */
export function bootstrapClient(): void {
  hydrateAuthStore();
  initAnalytics();
  void consumeSpotifyCallback();
}
