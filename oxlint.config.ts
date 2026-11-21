import cloudflare from "@cloudflare/oxlint-config";
import { recommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";

/**
 * Rules the Cloudflare preset enables for React. This repository renders with
 * Solid, so the React rules either do not apply or inspect the wrong semantics.
 */
const reactRulesOff = Object.fromEntries(
  Object.keys(cloudflare.rules ?? {})
    .filter((rule) => rule.startsWith("react/") || rule === "@nkzw/require-use-effect-arguments")
    .map((rule) => [rule, "off"]),
);

export default defineConfig({
  ...cloudflare,
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.cloudflare/**",
    "**/.wrangler/**",
    "**/test-results/**",
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
  ],
  // Plugins replaces oxlint's default set, so the preset list is kept and the
  // Effect rules are added to it.
  plugins: [...(cloudflare.plugins ?? []), "effecttsgo"],
  rules: {
    ...cloudflare.rules,
    ...reactRulesOff,
    ...recommended.rules,
    "typescript/no-explicit-any": "error",
    // The program parses untrusted input at its boundaries. Every narrowing
    // assertion there carries a SAFETY comment naming the invariant, which the
    // rule cannot evaluate.
    "typescript/no-unsafe-type-assertion": "off",
    // Every flagged spread is a plain JSON record, not a class instance; the
    // type-aware rule cannot distinguish the two here.
    "typescript/no-misused-spread": "off",
    // instanceof is used for exact local/SDK classes and platform objects,
    // never for Effect failures or Error.
    "@nkzw/no-instanceof": "off",
    // The repository writes single-statement blocks without braces and plain
    // array types. Both rules would rewrite the whole codebase without
    // changing behaviour, so the project style wins.
    curly: "off",
    "typescript/array-type": "off",
    "unicorn/numeric-separators-style": "off",
    // The codebase mixes top-level `import type` for wholly-type imports with
    // inline specifiers on mixed imports, which is idiomatic here. Forcing one
    // style rewrites every import in the project without changing behaviour.
    "import/consistent-type-specifier-style": "off",
    // Catch bindings are `cause` in newer code and `error` elsewhere. Where a
    // signal named `error` is in scope the rule has to invent `error_`, which
    // is worse than either established name.
    "unicorn/catch-error-name": "off",
    // `consistent-type-imports` normally splits mixed imports into a second
    // statement; the repository keeps `type` specifiers inline instead.
    "typescript/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    // There is no logger abstraction here: the browser app and the Worker
    // report failures through `console`, which is the only sink available.
    "no-console": "off",
    // The app is built on Effect's HTTP and SQL APIs, which are all marked
    // unstable in 4.1. Every diagnostic would point at a call site with no
    // stable replacement, so the warning only creates noise until Effect
    // stabilises them.
    "effecttsgo/unstable-api-usage": "off",
  },
  overrides: [
    ...(cloudflare.overrides ?? []),
    {
      // The Spotify client exposes every endpoint as a zero-argument function,
      // so `getProfile()` reads like `getLikedTracksPage(offset)`. Four of them
      // return an Effect without arguments; hoisting those to constants would
      // make the module's surface inconsistent for no runtime gain.
      files: ["src/client/spotify.ts"],
      rules: {
        "effecttsgo/lazy-effect": "off",
        // The four Spotify error classes are only ever built with `new`, using
        // positional constructors that fill the schema's `message`. None of
        // them is ever decoded, which is the case the diagnostic guards.
        "effecttsgo/overridden-schema-constructor": "off",
      },
    },
    {
      // Tests deliberately pass hand-built values through the unknown decoder,
      // which is the point of the decoder, and inspect thrown error instances
      // rather than forwarding them.
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "effecttsgo/prefer-typed-schema-decoder": "off",
        "typescript/use-unknown-in-catch-callback-variable": "off",
      },
    },
  ],
});
