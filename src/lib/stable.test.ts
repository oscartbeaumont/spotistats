import { describe, expect, it } from "vitest";

import { reuseUnchanged, shallowEqual } from "./stable";

interface Row {
  id: string;
  name: string;
}

const row = (id: string, name: string): Row => ({ id, name });

describe("reuseUnchanged", () => {
  it("keeps the previous object when nothing changed", () => {
    const previous = [row("a", "A"), row("b", "B")];
    const next = [row("a", "A"), row("b", "B")];
    const result = reuseUnchanged(previous, next, (item) => item.id);
    expect(result[0]).toBe(previous[0]);
    expect(result[1]).toBe(previous[1]);
  });

  it("takes the new object when a field changed", () => {
    const previous = [row("a", "A")];
    const next = [row("a", "A2")];
    const result = reuseUnchanged(previous, next, (item) => item.id);
    expect(result[0]).toBe(next[0]);
  });

  it("takes the new object for a row with no previous match", () => {
    const previous = [row("a", "A")];
    const next = [row("b", "B")];
    expect(reuseUnchanged(previous, next, (item) => item.id)[0]).toBe(next[0]);
  });

  it("keeps reused and fresh rows in order", () => {
    const previous = [row("a", "A"), row("b", "B")];
    const next = [row("b", "B"), row("c", "C"), row("a", "A")];
    const result = reuseUnchanged(previous, next, (item) => item.id);
    expect(result[0]).toBe(previous[1]);
    expect(result[1]).toBe(next[1]);
    expect(result[2]).toBe(previous[0]);
  });
});

describe("shallowEqual", () => {
  it("compares primitives and object fields", () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual(null, {})).toBe(false);
  });
});
