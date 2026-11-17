/**
 * Reuse the previous object for a row that has not changed.
 *
 * Polling replaces a list with freshly parsed objects every time, so a plain
 * `createMemo` over the response hands Solid's `<For>` all-new references and it
 * tears the rows down and rebuilds them — which reloads and re-decodes each
 * cover. Keeping the old reference for an unchanged row lets `<For>` keep its
 * DOM node (and the decoded image) in place.
 *
 * `previous` and `next` are matched by `key`; an item with no match, or one
 * whose fields changed, is used as-is.
 */
export function reuseUnchanged<T>(
  previous: readonly T[],
  next: readonly T[],
  key: (item: T) => string,
): T[] {
  const byKey = new Map(previous.map((item) => [key(item), item]));

  return next.map((item) => {
    const old = byKey.get(key(item));

    return old !== undefined && shallowEqual(old, item) ? old : item;
  });
}

function isObjectLike<A>(value: A): value is A & object {
  return typeof value === "object" && value !== null;
}

/** One level deep: enough for the flat row objects the lists carry. */
export function shallowEqual<A, B>(a: A, b: B): boolean {
  if (Object.is(a, b)) return true;

  if (!isObjectLike(a) || !isObjectLike(b)) return false;

  const aEntries = Object.entries(a);
  const bEntries = new Map(Object.entries(b));

  return (
    aEntries.length === bEntries.size &&
    aEntries.every(([name, value]) => bEntries.get(name) === value)
  );
}
