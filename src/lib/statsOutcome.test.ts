import { describe, expect, it } from "vitest";

import { statsOutcome } from "./statsOutcome";

describe("statsOutcome", () => {
  it("reads a completed handshake", () => {
    expect(statsOutcome("?stats=enabled")).toEqual({ kind: "enabled" });
  });

  it("reads a denied consent screen as its own outcome", () => {
    // https://github.com/oscartbeaumont/spotistats/issues/75
    expect(statsOutcome("?stats=failed&reason=spotify_denied")).toEqual({
      kind: "denied",
    });
  });

  it("keeps a real setup failure reportable", () => {
    expect(statsOutcome("?stats=failed&reason=spotify_unavailable")).toEqual({
      kind: "failed",
      reason: "spotify_unavailable",
    });
    expect(statsOutcome("?stats=failed&reason=internal_error")).toEqual({
      kind: "failed",
      reason: "internal_error",
    });
  });

  it("treats a failure without a reason as reportable", () => {
    expect(statsOutcome("?stats=failed")).toEqual({
      kind: "failed",
      reason: null,
    });
  });

  it("ignores an unrelated query", () => {
    expect(statsOutcome("")).toBeNull();
    expect(statsOutcome("?stats=unknown")).toBeNull();
    expect(statsOutcome("?foo=bar")).toBeNull();
  });
});
