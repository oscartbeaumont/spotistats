import { describe, expect, it } from "vitest";

import { externalHref, spotifyUri } from "./url";

describe("externalHref", () => {
  it("accepts http and https", () => {
    expect(externalHref("https://open.spotify.com/track/x")).toBe(
      "https://open.spotify.com/track/x",
    );
    expect(externalHref("http://example.com")).toBe("http://example.com");
  });

  it("rejects other schemes and malformed values", () => {
    expect(externalHref("javascript:alert(1)")).toBeUndefined();
    expect(externalHref("data:text/html,<script>")).toBeUndefined();
    expect(externalHref("not a url")).toBeUndefined();
    expect(externalHref(null)).toBeUndefined();
  });
});

describe("spotifyUri", () => {
  it("accepts spotify URIs", () => {
    expect(spotifyUri("spotify:track:x")).toBe("spotify:track:x");
  });

  it("rejects other values", () => {
    expect(spotifyUri("https://example.com")).toBeUndefined();
    expect(spotifyUri(undefined)).toBeUndefined();
  });
});
