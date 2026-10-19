import { describe, expect, it } from "vitest";

import { isUnfixableError } from "./analytics";

const syntheticScriptError = {
  event: "$exception",
  properties: {
    $exception_values: ["Script error."],
    $exception_list: [
      { type: "Error", value: "Script error.", mechanism: { synthetic: true } },
    ],
  },
};

const walletExtensionError = {
  event: "$exception",
  properties: {
    $exception_values: [
      "undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
    ],
  },
};

const applicationError = {
  event: "$exception",
  properties: {
    $exception_values: ["Importing a module script failed."],
    $exception_list: [
      { type: "TypeError", value: "Importing a module script failed.", mechanism: { synthetic: false } },
    ],
  },
};

describe("isUnfixableError", () => {
  it("drops cross-origin script errors that carry no detail", () => {
    expect(isUnfixableError(syntheticScriptError)).toBe(true);
  });

  it("drops errors raised by browser extensions", () => {
    expect(isUnfixableError(walletExtensionError)).toBe(true);
  });

  it("keeps errors the application can fix", () => {
    expect(isUnfixableError(applicationError)).toBe(false);
  });

  it("ignores events that are not exceptions", () => {
    expect(isUnfixableError({ event: "$pageview", properties: {} })).toBe(false);
    expect(isUnfixableError({})).toBe(false);
  });
});
