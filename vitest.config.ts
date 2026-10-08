import { defineConfig } from "vitest/config";

// The app build uses the Solid and Cloudflare Vite plugins; the unit tests only
// need the TypeScript sources, so keep a separate, plugin-free config.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
