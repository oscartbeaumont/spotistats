/**
 * Repository oxlint config.
 *
 * The anti-slop rules are vendored in `tools/oxlint/anti-slop` so they can be
 * read and changed like the rest of the code, and this file is the entry point
 * oxlint discovers.
 */
import { fileURLToPath } from "node:url";
import { defineConfig, type OxlintConfig } from "oxlint";

/** Deeper chains are not readable; the rule points at the whole expression. */
const maxTernaryDepth: ["error", { maxDepth: number }] = ["error", { maxDepth: 2 }];

export const antiSlopLint = {
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
    // The vendored plugin is linted by its own tests, not by itself.
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [
    {
      name: "anti-slop",
      specifier: fileURLToPath(new URL("./tools/oxlint/anti-slop/index.ts", import.meta.url)),
    },
    {
      name: "anti-slop-effect",
      specifier: fileURLToPath(new URL("./tools/oxlint/anti-slop/effect/index.ts", import.meta.url)),
    },
    {
      name: "anti-slop-martinfowler",
      specifier: fileURLToPath(new URL("./tools/oxlint/anti-slop/martinfowler/index.ts", import.meta.url)),
    },
  ],
  // `plugins` replaces oxlint's default set, so the defaults are listed again.
  plugins: ["eslint", "typescript", "unicorn", "oxc", "jsx-a11y"],
  rules: {
    // The codebase is strict everywhere else; a new `any` is never acceptable.
    // Tests exercise intentionally malformed input and third-party mocks, so
    // they are exempted below rather than peppering them with directives.
    "typescript/no-explicit-any": "error",
    "oxc/no-accumulating-spread": "error",
    "anti-slop/max-ternary-depth": maxTernaryDepth,
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-spread": "error",
    "anti-slop/no-disabled-type-assertion-rules": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-layout-animating-transition": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-reprovide-ambient-service": "error",
    "anti-slop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-media-dimensions": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    "anti-slop-effect/no-manual-effect-error-tag": "error",
    "anti-slop-effect/no-manual-tag-comparison": "error",
    "anti-slop-effect/no-manual-tagged-construction": "error",
    "anti-slop-effect/no-manual-tagged-type": "error",
    "anti-slop-effect/no-ordie-in-service-construction": "error",
    "anti-slop-effect/no-service-constructor-imports": "error",
    "anti-slop-effect/no-service-parameters": "error",
    // Tests are colocated under `src/` in this repository, so the rule only
    // asks for a different layout; it is the one Effect rule this repo cannot
    // follow without moving every test file.
    "anti-slop-effect/no-test-code-in-src": "off",
    "anti-slop-effect/prefer-effect-match": "error",
    "anti-slop-effect/prefer-tagged-error-handling": "error",
    "anti-slop-effect/prefer-yield-service": "error",
    "anti-slop-effect/require-cause-when-narrowing": "error",
    "anti-slop-effect/require-operation-span": "error",
    "anti-slop-effect/require-service-make-layer": "error",
    // Fowler code smells.
    "anti-slop-martinfowler/global-data": "error",
    "anti-slop-martinfowler/long-function": "error",
    "anti-slop-martinfowler/long-parameter-list": "error",
    "anti-slop-martinfowler/loops": "error",
    "anti-slop-martinfowler/message-chains": "error",
    "anti-slop-martinfowler/mutable-data": "error",
    "anti-slop-martinfowler/mysterious-name": "error",
    "anti-slop-martinfowler/repeated-switches": "error",
    // eslint-plugin-jsx-a11y's recommended set. SolidJS renders the same JSX
    // attributes these rules inspect, so they apply unchanged. Rules that are
    // off in the upstream recommendation, cannot see through Kobalte's
    // primitives, or assume React's `htmlFor` are disabled with a note.
    "jsx-a11y/alt-text": "error",
    "jsx-a11y/anchor-has-content": "error",
    "jsx-a11y/anchor-is-valid": "error",
    "jsx-a11y/aria-activedescendant-has-tabindex": "error",
    "jsx-a11y/aria-props": "error",
    "jsx-a11y/aria-proptypes": "error",
    "jsx-a11y/aria-role": "error",
    "jsx-a11y/aria-unsupported-elements": "error",
    "jsx-a11y/autocomplete-valid": "error",
    "jsx-a11y/click-events-have-key-events": "error",
    // Off upstream; the rule is advisory and flags decorative copy.
    "jsx-a11y/anchor-ambiguous-text": "off",
    // Off upstream. It cannot evaluate dynamic `children`, so shared label
    // primitives and dialog labels report false positives.
    "jsx-a11y/control-has-associated-label": "off",
    // Solid renders labels with `for`, not React's `htmlFor`, and the rule only
    // understands `htmlFor`, so it reports every Solid label.
    "jsx-a11y/label-has-associated-control": "off",
    "jsx-a11y/heading-has-content": "error",
    "jsx-a11y/html-has-lang": "error",
    "jsx-a11y/iframe-has-title": "error",
    "jsx-a11y/img-redundant-alt": "error",
    "jsx-a11y/interactive-supports-focus": [
      "error",
      {
        tabbable: ["button", "checkbox", "link", "searchbox", "spinbutton", "switch", "textbox"],
      },
    ],
    "jsx-a11y/media-has-caption": "error",
    "jsx-a11y/mouse-events-have-key-events": "error",
    "jsx-a11y/no-access-key": "error",
    "jsx-a11y/no-aria-hidden-on-focusable": "error",
    "jsx-a11y/no-autofocus": "error",
    "jsx-a11y/no-distracting-elements": "error",
    "jsx-a11y/no-interactive-element-to-noninteractive-role": [
      "error",
      { tr: ["none", "presentation"], canvas: ["img"] },
    ],
    "jsx-a11y/no-noninteractive-element-interactions": "error",
    "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
    "jsx-a11y/no-noninteractive-tabindex": [
      "error",
      { tags: [], roles: ["tabpanel"], allowExpressionValues: true },
    ],
    "jsx-a11y/no-redundant-roles": "error",
    "jsx-a11y/no-static-element-interactions": "error",
    // `role="status"` on styled divs is a deliberate live region; replacing it
    // with <output> changes layout. Keep the role, not the suggestion.
    "jsx-a11y/prefer-tag-over-role": "off",
    "jsx-a11y/role-has-required-aria-props": "error",
    "jsx-a11y/role-supports-aria-props": "error",
    "jsx-a11y/scope": "error",
    "jsx-a11y/tabindex-no-positive": "error",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/tests/**"],
      rules: { "typescript/no-explicit-any": "off" },
    },
  ],
} satisfies OxlintConfig;

export default defineConfig(antiSlopLint);
