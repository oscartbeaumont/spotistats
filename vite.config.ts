import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

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
