import { Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

// `./spotify` reads the worker env to build its Basic auth header; decoding a
// profile never reaches it, so an empty env is enough.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { SpotifyProfile } from "./spotify";

describe("Spotify profile decoding", () => {
  const profile = {
    id: "user",
    display_name: null,
    uri: "spotify:user:user",
    external_urls: { spotify: "https://open.spotify.com/user/user" },
    followers: { total: 0 },
  };

  // Spotify returns `null` for an account with no email (for example a phone
  // signup), which a plain `Schema.optional(Schema.String)` rejects.
  it("accepts an account with no email", () => {
    const decoded = Schema.decodeUnknownSync(SpotifyProfile)({ ...profile, email: null });
    expect(decoded.email).toBeNull();
  });

  it("accepts a profile that omits the email", () => {
    const decoded = Schema.decodeUnknownSync(SpotifyProfile)(profile);
    expect(decoded.email).toBeUndefined();
  });
});
