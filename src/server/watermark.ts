/**
 * Chooses the `after` cursor for the next recently-played sync.
 *
 * Spotify returns at most 50 plays, and only the recent window. When the page
 * is full, more plays may have happened than the window can return, so the
 * cursor stays at the oldest fetched play: the next sync re-reads this window
 * instead of advancing past plays Spotify has already evicted. When the page
 * is short, the cursor moves to the newest play.
 */
export function nextWatermark(
  fetchedCount: number,
  playedAtMsValues: ReadonlyArray<number>,
  previous: number | null,
): number | null {
  if (playedAtMsValues.length === 0) return previous;
  const oldest = Math.min(...playedAtMsValues);
  const newest = Math.max(previous ?? 0, ...playedAtMsValues);
  return fetchedCount >= 50 ? oldest : newest;
}
