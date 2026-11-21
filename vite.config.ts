import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import solid from "@solidjs/vite-plugin";
import { Option, Schema } from "effect";
import { defineConfig, type Plugin } from "vite";

// The Cloudflare build does not always have this set, but it is public.
if (!process.env?.VITE_SPOTIFY_CLIENT_ID)
  process.env.VITE_SPOTIFY_CLIENT_ID = "1107a25b98c041bb90c9063553e5f1a8";

/**
 * Where the Solid plugin looks for a client manifest it can bake into the
 * server bundle. The name is the plugin's convention, not this project's.
 */
const clientManifestPath = path.resolve("dist/client/.vite/manifest.json");

/** The manifest fields that name an emitted file. */
const ManifestEntry = Schema.Struct({
  file: Schema.optional(Schema.String),
  css: Schema.optional(Schema.Array(Schema.String)),
  assets: Schema.optional(Schema.Array(Schema.String)),
});

const decodeManifestEntry = Schema.decodeUnknownOption(ManifestEntry);

/**
 * The files a Vite manifest says the app can request.
 *
 * Every emitted chunk appears in the manifest, including dynamic and shared
 * ones, so anything under `assets/` that is missing here is a leftover from an
 * earlier build.
 */
function shippedFiles(manifest: Schema.JsonObject): Set<string> {
  const shipped = new Set<string>();

  Object.values(manifest)
    .map((record) => Option.getOrNull(decodeManifestEntry(record)))
    .forEach((entry) => {
      if (entry === null) return;

      if (entry.file !== undefined) shipped.add(path.basename(entry.file));
      entry.css?.forEach((value) => shipped.add(path.basename(value)));
      entry.assets?.forEach((value) => shipped.add(path.basename(value)));
    });

  return shipped;
}

/** Replaces the client manifest baked into the Worker bundle with `manifest`. */
function replaceBakedManifest(
  code: string,
  bundlePath: string,
  manifest: Schema.JsonObject,
): string {
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
      `Could not find the Solid client manifest in ${bundlePath}. The Solid plugin falls back to its dev manifest when it has no client manifest, and that one carries no object to replace here: check that ${clientManifestPath} exists before the Worker build.`,
    );
  }

  // The fallback build names the virtual manifest variable after the
  // plugin's internal alias. A build that found a client manifest inlines
  // it as `manifest` instead.
  const replacement = `var ${declaration[1]} = ${JSON.stringify(manifest)};\n`;

  return `${code.slice(0, declarationStart)}${replacement}${code.slice(declarationEnd + "\n};".length)}`;
}

/**
 * Drops `$$moduleUrl` from a Worker entry's exports.
 *
 * Solid appends a `$$moduleUrl` export to every SSR module. The Worker entry
 * re-exports it, but Workers module exports must be functions or handlers.
 */
function dropModuleUrlExport(code: string): string {
  return code.replaceAll(
    /export\s*\{([^}]*)\}\s*;/g,
    (_match, exports: string) => {
      const kept = exports
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry && entry !== "$$moduleUrl");

      return kept.length > 0 ? `export { ${kept.join(", ")} };` : "";
    },
  );
}

/** Removes chunks the early client build left behind in `assets/`. */
function pruneStaleAssets(outDir: string, manifest: Schema.JsonObject): void {
  const shipped = shippedFiles(manifest);
  const assetsDir = path.join(outDir, "assets");

  if (!existsSync(assetsDir)) return;

  for (const name of readdirSync(assetsDir)) {
    // Only scripts and their maps: `assets/` also holds the public images.
    if (!/\.m?js(?:\.map)?$/.test(name)) continue;

    if (shipped.has(name.replace(/\.map$/, ""))) continue;
    rmSync(path.join(assetsDir, name));
  }
}

/**
 * `cf build` runs the Solid client build twice: an early client build, the
 * Worker/SSR build, then the deployable client build. The Solid server bundle
 * bakes the client asset manifest at build time, so the one it sees during the
 * middle build does not match the final client hashes.
 *
 * Patch the Worker bundle with the final client manifest after the last client
 * build, keep the conventional `dist/client` manifest in sync for preview, and
 * drop the chunks the early build left behind.
 */
function solidClientManifest(): Plugin {
  return {
    name: "solid-client-manifest",
    apply: "build",
    writeBundle(_outputOptions, bundle) {
      if (this.environment?.name !== "client") return;

      // The Solid plugin sources the manifest from a client build in the same
      // process, or from `dist/client/.vite/manifest.json`. `cf build` runs the
      // deployable client build after the Worker build, in its own process, so
      // the Worker build only sees the file, and a fresh checkout has none. It
      // then emits its dev manifest, which has no manifest object to patch.
      //
      // Publish each client manifest as it is written, so the early client
      // build hands the Worker build the same manifest shape a single
      // `vite build` would have given it.
      const asset = bundle[".vite/manifest.json"];

      if (asset?.type !== "asset") return;
      mkdirSync(path.dirname(clientManifestPath), { recursive: true });
      writeFileSync(
        clientManifestPath,
        Schema.is(Schema.String)(asset.source)
          ? asset.source
          : Buffer.from(asset.source),
      );
    },
    closeBundle() {
      const environment = this.environment;

      if (environment?.name !== "client") return;

      const outDir = environment.config.build.outDir;
      const manifestPath = path.join(outDir, ".vite/manifest.json");

      if (!existsSync(manifestPath)) return;

      const bundlePath = path.resolve(outDir, "../bundle/index.js");

      if (!existsSync(bundlePath)) return;

      const parsed = Schema.decodeUnknownSync(Schema.JsonObject)(
        JSON.parse(readFileSync(manifestPath, "utf8")),
      );

      const manifest: Schema.JsonObject = {
        ...parsed,
        _base: environment.config.base || "/",
      };

      const code = readFileSync(bundlePath, "utf8");
      const withManifest = replaceBakedManifest(code, bundlePath, manifest);

      writeFileSync(bundlePath, dropModuleUrlExport(withManifest));

      mkdirSync(path.dirname(clientManifestPath), { recursive: true });
      writeFileSync(clientManifestPath, JSON.stringify(manifest));

      // The early client build wrote its chunks into the same directory, and
      // its hashes do not survive the Worker build, so nothing can request
      // them. Drop them rather than uploading two builds' worth of assets.
      pruneStaleAssets(outDir, manifest);
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
