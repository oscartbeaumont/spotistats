import { describe, expect, it } from "vitest";

import {
  authorizationExpiry,
  authorizationNeedsReconnect,
  isClientCredentialFailure,
  reauthMessage,
  reconnectWarningMs,
  refreshTokenLifetimeMs,
  spotifyErrorCode,
} from "./authorization";

/** 2026-04-22, roughly when the listening-stats sync first shipped. */
const authorizedAt = Date.UTC(2026, 3, 22);
const expiresAt = authorizedAt + refreshTokenLifetimeMs;

describe("authorizationExpiry", () => {
  it("has no expiry without an authorization", () => {
    expect(authorizationExpiry(null)).toBeNull();
  });

  it("runs six months from the authorization", () => {
    expect(authorizationExpiry(authorizedAt)).toBe(expiresAt);
  });
});

describe("authorizationNeedsReconnect", () => {
  it("stays quiet well before the expiry", () => {
    expect(
      authorizationNeedsReconnect(authorizedAt, expiresAt - reconnectWarningMs - 1),
    ).toBe(false);
  });

  it("warns inside the final fortnight", () => {
    expect(
      authorizationNeedsReconnect(authorizedAt, expiresAt - reconnectWarningMs + 1),
    ).toBe(true);
  });

  it("keeps warning once the authorization has lapsed", () => {
    expect(authorizationNeedsReconnect(authorizedAt, expiresAt + 1)).toBe(true);
  });

  it("stays quiet without an authorization", () => {
    expect(authorizationNeedsReconnect(null, Date.now())).toBe(false);
  });
});

describe("spotifyErrorCode", () => {
  it("reads the RFC 6749 error code out of the body", () => {
    expect(
      spotifyErrorCode(
        '{"error":"invalid_grant","error_description":"Refresh token expired"}',
      ),
    ).toBe("invalid_grant");
  });

  it("is null when the body carries no code", () => {
    expect(spotifyErrorCode("Bad Request")).toBeNull();
  });
});

describe("isClientCredentialFailure", () => {
  it("recognises invalid_client", () => {
    expect(isClientCredentialFailure('{"error":"invalid_client"}')).toBe(true);
  });

  it("does not mistake a lapsed user authorization for it", () => {
    expect(isClientCredentialFailure('{"error":"invalid_grant"}')).toBe(false);
  });
});

describe("reauthMessage", () => {
  it("explains the six-month expiry", () => {
    expect(reauthMessage('{"error":"invalid_grant"}')).toContain("six months");
  });

  it("does not claim a lapsed authorization for invalid_client", () => {
    expect(reauthMessage('{"error":"invalid_client"}')).not.toContain("Reconnect");
  });

  it("falls back to a generic explanation", () => {
    expect(reauthMessage("Bad Request")).toContain("Reconnect Spotify stats");
    expect(reauthMessage()).toContain("Reconnect Spotify stats");
  });
});
