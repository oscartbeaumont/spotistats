export function isEditableShortcutTarget(event: KeyboardEvent | null) {
  const target = event?.target;
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

export function platformShortcutModifier() {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘" : "Ctrl";
}
