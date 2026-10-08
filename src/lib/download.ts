export function downloadTextFile(
  name: string,
  body: string,
  mime = "text/csv;charset=utf-8",
) {
  // Object URLs avoid the ~2 MB cap browsers place on `data:` URLs, so large
  // playlist exports are not silently truncated or blocked.
  downloadBlob(name, new Blob([body], { type: mime }));
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next task; revoking synchronously can abort the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Neutralises spreadsheet formula injection. A cell that starts with one of
 * the formula triggers is prefixed with an apostrophe so Excel, Sheets, and
 * friends treat it as text.
 */
export function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  // Numbers are emitted verbatim so negative numeric columns (loudness, tempo
  // deltas) stay numeric; only text can carry a formula payload.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Makes an untrusted name safe to use as a single file name. */
export function safeFileName(name: string) {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "untitled";
}

/** Selects a CSV archive entry without replacing an earlier playlist. */
export function playlistArchiveName(name: string, exists: (name: string) => boolean) {
  const base = safeFileName(name);
  let candidate = `${base}.csv`;
  let suffix = 2;
  while (exists(candidate)) candidate = `${base} (${suffix++}).csv`;
  return candidate;
}
