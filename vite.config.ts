import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

// TODO: idk why Cloudflare Workers CI system isn't setting this.
if (!process.env?.VITE_SPOTIFY_CLIENT_ID)
  process.env.VITE_SPOTIFY_CLIENT_ID = "1107a25b98c041bb90c9063553e5f1a8";

export default defineConfig({
  server: {
    host: "127.0.0.1",
  },
  plugins: [
    solidStart(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
  ],
});
