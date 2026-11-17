import { Option, Predicate, Schema } from "effect";

/**
 * Reads a human-readable message off a thrown value.
 *
 * A thrown value is an arbitrary error cause, so it arrives as `unknown` and is
 * decoded here before use: `Error` first, then a `message`, then a tagged
 * error's `_tag`, and finally its string form.
 */

const Messaged = Schema.Struct({ message: Schema.String });

/** A tagged error's `_tag`, when the thrown value carries one. */
const taggedName = (cause: unknown): string | null => {
  if (!Predicate.hasProperty(cause, "_tag")) return null;

  return Schema.is(Schema.String)(cause._tag) ? cause._tag : null;
};

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;

  const messaged = Option.getOrNull(Schema.decodeUnknownOption(Messaged)(cause));

  if (messaged !== null) return messaged.message;

  return taggedName(cause) ?? String(cause);
}
