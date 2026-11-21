import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { errorMessage } from "./errors";

/** A tagged value that is not an `Error`, so only its tag can name it. */
class TaggedFailure extends Schema.TaggedClass<TaggedFailure, { readonly brand: unique symbol }>()(
  "UpstreamError",
  {},
) {}

describe("errorMessage", () => {
  it("reads the message off an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back to a tagged error's tag", () => {
    expect(errorMessage(new TaggedFailure({}))).toBe("UpstreamError");
  });

  it("stringifies anything else", () => {
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(42)).toBe("42");
  });
});
