/** URL schemes we are willing to navigate to. */
const safeProtocols = new Set(["https:", "http:"]);

/** Returns the URL only when it is a safe absolute web link. */
export function externalHref(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    if (safeProtocols.has(new URL(value).protocol)) return value;
  } catch {
    // Not an absolute URL; treat it as unsafe.
  }
  return undefined;
}

/** Returns the URI only when it is a Spotify URI. */
export function spotifyUri(
  value: string | null | undefined,
): string | undefined {
  return value?.startsWith("spotify:") ? value : undefined;
}
