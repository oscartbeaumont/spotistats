import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The app build uses the Solid and Cloudflare Vite plugins; the unit tests only
// need the TypeScript sources, so keep a separate, plugin-free config. The `~`
// alias still has to match `vite.config.ts` so modules resolve the same way.
export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
