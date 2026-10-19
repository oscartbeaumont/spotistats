/**
 * Recovers from deploy skew.
 *
 * A tab that was loaded before a deploy still refers to chunk names that the
 * new build no longer publishes. Solid loads those routes with `lazy()`, so
 * the import fails and the route never renders — which is what surfaces as
 * "Importing a module script failed." or "Failed to fetch dynamically imported
 * module". Reloading once picks up the new document and its chunk names.
 *
 * The reload is rate limited through `sessionStorage` so a genuinely broken
 * bundle cannot put the tab in a reload loop.
 */

const reloadKey = "spotistats:deploy-reload-at";
const reloadWindowMs = 10_000;

const chunkLoadFailurePatterns = [
  /importing a module script failed/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /dynamically imported module/i,
];

export const isChunkLoadFailure = (value: unknown): boolean => {
  const message =
    value instanceof Error ? `${value.name}: ${value.message}` : String(value ?? "");
  return chunkLoadFailurePatterns.some((pattern) => pattern.test(message));
};

const shouldReload = (): boolean => {
  try {
    const previous = Number(sessionStorage.getItem(reloadKey) ?? "0");
    if (Number.isFinite(previous) && Date.now() - previous < reloadWindowMs) {
      return false;
    }
    sessionStorage.setItem(reloadKey, String(Date.now()));
  } catch {
    // Storage can be blocked; the reload is still worth attempting once.
  }
  return true;
};

export function recoverFromDeploySkew(): void {
  if (typeof window === "undefined") return;

  const reloadOnce = (cause: unknown) => {
    if (!isChunkLoadFailure(cause) || !shouldReload()) return;
    window.location.reload();
  };

  window.addEventListener("error", (event) => reloadOnce(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reloadOnce(event.reason));
}
