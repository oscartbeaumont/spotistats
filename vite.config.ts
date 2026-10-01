import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

// The Cloudflare build does not always have this set, but it is public.
if (!process.env?.VITE_SPOTIFY_CLIENT_ID)
  process.env.VITE_SPOTIFY_CLIENT_ID = "1107a25b98c041bb90c9063553e5f1a8";

export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
  },
  plugins: [solid(), cloudflare(), tailwindcss()],
});
