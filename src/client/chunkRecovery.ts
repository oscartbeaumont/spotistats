/**
 * Recovers from a failed lazy-chunk load.
 *
 * Every route is a dynamic `import()`, and a deploy replaces the hashed chunk
 * files. A browser that is still running the previous page (or a cached shell)
 * then asks for a chunk that no longer exists and the import rejects with
 * `TypeError: Importing a module script failed.` — the app renders nothing and
 * looks like a blank page or a permanent loading state.
 *
 * Vite fires `vite:preloadError` for exactly this case. Reloading fetches the
 * new shell and its chunk names. A short cooldown stops a reload loop when the
 * chunk is genuinely gone rather than merely stale.
 */

const RELOAD_KEY = "spotistats:chunk-reload-at";
const COOLDOWN_MS = 10_000;

interface ReloadTarget {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  location: { reload: () => void };
}

interface CooldownStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function installChunkRecovery(
  target: ReloadTarget,
  storage: CooldownStorage,
  now: () => number = Date.now,
  cooldownMs = COOLDOWN_MS,
): void {
  target.addEventListener("vite:preloadError", (event) => {
    let last = 0;
    try {
      last = Number(storage.getItem(RELOAD_KEY) ?? 0);
    } catch {
      // Storage can be blocked; treat it as "never reloaded".
    }
    if (Number.isFinite(last) && now() - last < cooldownMs) return;

    // Keep the default so the error still surfaces if the reload does not help.
    event.preventDefault?.();
    try {
      storage.setItem(RELOAD_KEY, String(now()));
    } catch {
      // The reload still happens; only the loop guard is lost.
    }
    target.location.reload();
  });
}
