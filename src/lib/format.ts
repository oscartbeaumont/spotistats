/** Formats a timestamp for display, or `Never` when it is missing. */
export function formatDate(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "Never";
  return new Date(value).toLocaleString();
}
