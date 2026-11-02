import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import solid from "@solidjs/vite-plugin";
import { defineConfig, type Plugin } from "vite";

// The Cloudflare build does not always have this set, but it is public.
if (!process.env?.VITE_SPOTIFY_CLIENT_ID)
  process.env.VITE_SPOTIFY_CLIENT_ID = "1107a25b98c041bb90c9063553e5f1a8";

/**
 * `cf build` runs the Solid client build twice: an early client build, the
 * Worker/SSR build, then the deployable client build. The Solid server bundle
 * bakes the client asset manifest at build time, so the one it sees during the
 * middle build does not match the final client hashes.
 *
 * Patch the Worker bundle with the final client manifest after the last client
 * build, and keep the conventional `dist/client` manifest in sync for preview.
 */
function solidClientManifest(): Plugin {
  return {
    name: "solid-client-manifest",
    apply: "build",
    closeBundle() {
      const environment = this.environment;
      if (environment?.name !== "client") return;

      const outDir = environment.config.build.outDir;
      const manifestPath = path.join(outDir, ".vite/manifest.json");
      if (!existsSync(manifestPath)) return;

      const bundlePath = path.resolve(outDir, "../bundle/index.js");
      if (!existsSync(bundlePath)) return;

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
        string,
        unknown
      >;
      manifest._base = environment.config.base || "/";

      const code = readFileSync(bundlePath, "utf8");
      const marker = code.indexOf("virtual:solid-manifest");
      const declarationStart = marker < 0 ? -1 : code.indexOf("var ", marker);
      const declaration =
        declarationStart < 0
          ? null
          : /^var\s+([A-Za-z0-9_$]+)\s*=\s*\{/.exec(code.slice(declarationStart));
      const declarationEnd = declaration
        ? code.indexOf("\n};", declarationStart)
        : -1;
      if (!declaration || declarationEnd < 0) {
        throw new Error(
          "Could not find the Solid client manifest in the Worker bundle.",
        );
      }

      // The fallback build names the virtual manifest variable after the
      // plugin's internal alias. A build that found a client manifest inlines
      // it as `manifest` instead.
      const replacement = `var ${declaration[1]} = ${JSON.stringify(manifest)};\n`;
      const withManifest = `${code.slice(0, declarationStart)}${replacement}${code.slice(declarationEnd + "\n};".length)}`;

      // Solid appends a `$$moduleUrl` export to every SSR module. The Worker
      // entry re-exports it, but Workers module exports must be functions or
      // handlers. Drop it from the entry's export list.
      const patched = withManifest.replace(
        /export\s*\{([^}]*)\}\s*;/g,
        (_match, exports: string) => {
          const kept = exports
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry && entry !== "$$moduleUrl");
          return kept.length > 0 ? `export { ${kept.join(", ")} };` : "";
        },
      );

      writeFileSync(bundlePath, patched);

      const distManifest = path.resolve("dist/client/.vite/manifest.json");
      mkdirSync(path.dirname(distManifest), { recursive: true });
      writeFileSync(distManifest, JSON.stringify(manifest));
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
  },
  // PostHog error tracking fetches a served bundle's source map to symbolicate
  // production stack traces. Only the client needs them: without one every
  // report arrives minified, which made the `SpotifyApiError` triage a guess.
  environments: {
    client: {
      build: { sourcemap: true },
    },
  },
  plugins: [
    // Start mode with SSR. The plugin owns the client entry, the document
    // shell and the server render. `externalServer` hands the Worker entry to
    // us, because the worker also runs the sync queue and the cron trigger.
    solid({
      ssr: true,
      start: {
        externalServer: true,
        app: "./src/App.tsx",
        document: "./src/Document.tsx",
        middleware: "./src/server/middleware.ts",
      },
    }),
    // Map the Worker to Solid's `ssr` environment so the server render and the
    // Effect API run in workerd, with the D1 and queue bindings.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    solidClientManifest(),
  ],
});
