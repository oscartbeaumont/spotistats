import { describe, expect, it } from "vitest";

import {
  canonicalUrl,
  handoverUrl,
  isContentPath,
  isPublicPath,
  onLegacyOrigin,
  titleForPath,
} from "./seo";

describe("public route helpers", () => {
  it("treats the sign-in screen and the policy pages as public", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/security")).toBe(true);
  });

  it("keeps the authenticated app private", () => {
    expect(isPublicPath("/account")).toBe(false);
    expect(isPublicPath("/export")).toBe(false);
    expect(isPublicPath("/favourites/tracks")).toBe(false);
  });

  it("only gives the policy pages their own canonical URL", () => {
    expect(isContentPath("/privacy")).toBe(true);
    expect(isContentPath("/security")).toBe(true);
    expect(isContentPath("/")).toBe(false);
    expect(isContentPath("/login")).toBe(false);
  });

  it("titles the policy pages distinctly", () => {
    expect(titleForPath("/privacy")).toContain("Privacy");
    expect(titleForPath("/security")).toContain("Security");
    expect(titleForPath("/")).toBe(titleForPath("/login"));
  });
});

describe("canonical origin", () => {
  it("names the canonical host whatever host the browser is on", () => {
    expect(canonicalUrl("/")).toBe("https://spotistats.otbeaumont.me/");
    expect(canonicalUrl("/account")).toBe(
      "https://spotistats.otbeaumont.me/account",
    );
    expect(canonicalUrl("/login", "?start=1")).toBe(
      "https://spotistats.otbeaumont.me/login?start=1",
    );
  });

  it("hands over only the legacy alias, never a dev or preview origin", () => {
    expect(onLegacyOrigin("https://spotistats.js.org")).toBe(true);
    expect(onLegacyOrigin("https://spotistats.otbeaumont.me")).toBe(false);
    expect(onLegacyOrigin("http://localhost:5173")).toBe(false);
    expect(onLegacyOrigin("http://127.0.0.1:5173")).toBe(false);
    expect(onLegacyOrigin("https://spotistats-preview.workers.dev")).toBe(false);
  });

  it("hands a path to the canonical origin only from the alias", () => {
    expect(handoverUrl("/account", "", "https://spotistats.js.org")).toBe(
      "https://spotistats.otbeaumont.me/account",
    );
    expect(
      handoverUrl("/account", "?stats=failed", "https://spotistats.js.org"),
    ).toBe("https://spotistats.otbeaumont.me/account?stats=failed");
    // Everything else keeps its own origin, so a local session is never
    // abandoned for production.
    expect(handoverUrl("/account", "", "https://spotistats.otbeaumont.me")).toBeNull();
    expect(handoverUrl("/account", "", "http://localhost:5173")).toBeNull();
  });
});
