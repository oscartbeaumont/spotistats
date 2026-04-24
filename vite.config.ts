import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    solidStart(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
  ],
});
