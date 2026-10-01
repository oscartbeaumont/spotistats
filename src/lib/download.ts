export function downloadTextFile(
  name: string,
  body: string,
  mime = "text/csv;charset=utf-8",
) {
  const href = `data:${mime},${encodeURIComponent(body)}`;
  const anchor = document.createElement("a");
  anchor.style.display = "none";
  anchor.href = href;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Neutralises spreadsheet formula injection. A cell that starts with one of
 * the formula triggers is prefixed with an apostrophe so Excel, Sheets, and
 * friends treat it as text.
 */
export function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
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
