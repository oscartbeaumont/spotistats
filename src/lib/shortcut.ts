import { onSettled } from "solid-js";

/** Keyboard shortcuts without an external dependency. */

export function isEditableShortcutTarget(event: KeyboardEvent | null) {
  const target = event?.target;
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
  );
}

const matches = (keys: ReadonlyArray<string>, event: KeyboardEvent) => {
  let alt = false;
  let control = false;
  let shift = false;
  let meta = false;
  const plain: string[] = [];

  for (const key of keys) {
    switch (key.toLowerCase()) {
      case "alt":
        alt = true;
        break;
      case "control":
      case "ctrl":
        control = true;
        break;
      case "shift":
        shift = true;
        break;
      case "meta":
      case "cmd":
        meta = true;
        break;
      default:
        plain.push(key);
        break;
    }
  }

  if (plain.length !== 1) return false;
  if (
    alt !== event.altKey ||
    control !== event.ctrlKey ||
    shift !== event.shiftKey ||
    meta !== event.metaKey
  ) {
    return false;
  }
  const key = plain[0];
  return key !== undefined && key.toLowerCase() === event.key.toLowerCase();
};

export function createShortcut(
  keys: ReadonlyArray<string>,
  handler: (event: KeyboardEvent) => void,
  options?: { preventDefault?: boolean; allowEditable?: boolean },
) {
  onSettled(() => {
    const listener = (event: KeyboardEvent) => {
      // Ignore OS auto-repeat; the shortcut fires once per press.
      if (event.repeat) return;
      // Check the target before calling preventDefault, or a keystroke in an
      // input would be swallowed before the handler can bail out.
      if (!options?.allowEditable && isEditableShortcutTarget(event)) return;
      if (!matches(keys, event)) return;
      if (options?.preventDefault !== false) event.preventDefault();
      handler(event);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
}
