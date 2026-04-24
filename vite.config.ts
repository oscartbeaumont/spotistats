import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

// TODO
console.log("SPOTIFY CLIENT ID IN VITE", process.env?.VITE_SPOTIFY_CLIENT_ID);

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
