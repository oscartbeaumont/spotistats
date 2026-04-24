export function downloadTextFile(name: string, body: string, mime = "text/csv;charset=utf-8") {
  const href = `data:${mime},${encodeURIComponent(body)}`;
  const anchor = document.createElement("a");
  anchor.style.display = "none";
  anchor.href = href;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
