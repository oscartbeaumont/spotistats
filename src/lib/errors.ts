export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
    if ("_tag" in error && typeof error._tag === "string") {
      return error._tag;
    }
  }
  return String(error);
}
