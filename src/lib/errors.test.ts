import { describe, expect, it } from "vitest";

import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("reads the message off an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back to a tagged error's tag", () => {
    expect(errorMessage({ _tag: "UpstreamError" })).toBe("UpstreamError");
  });

  it("stringifies anything else", () => {
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(42)).toBe("42");
  });
});
