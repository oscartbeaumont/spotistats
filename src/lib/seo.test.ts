import { describe, expect, it } from "vitest";

import { isContentPath, isPublicPath, titleForPath } from "./seo";

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
