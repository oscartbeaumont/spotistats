export type ViewTransitionDirection = "forward" | "backward";

/**
 * Progressive enhancement for SPA state changes. Unsupported browsers and
 * reduced-motion users still get the update, just without spatial movement.
 */
export function runViewTransition(
  update: () => void | Promise<void>,
  direction: ViewTransitionDirection,
) {
  if (
    typeof document === "undefined" ||
    typeof document.startViewTransition !== "function" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  ) {
    void update();

    return null;
  }

  try {
    return document.startViewTransition({
      update,
      types: [`week-${direction}`],
    });
  } catch {
    // Older implementations accept only a callback. Never let an optional
    // animation strand the navigation update.
    void update();

    return null;
  }
}
