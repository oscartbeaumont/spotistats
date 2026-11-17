/** A Spotify image, of which clients only ever display the first. */
interface SpotifyImage {
  readonly url: string;
}

/**
 * The first image URL in a Spotify image list, or `undefined` when the list is
 * missing or empty.
 *
 * Every surface that shows a cover reads the same nested field, so it lives
 * here instead of each one walking `images[0].url` itself.
 */
export function firstImageUrl(
  images: readonly SpotifyImage[] | null | undefined,
): string | undefined {
  return images?.[0]?.url;
}
