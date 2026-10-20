import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
  accountId: "f8b7c4b3e3ed4fb3d04a4264e21dd18e",
  worker: {
    name: "spotistats",
    compatibilityDate: "2026-04-24",
    compatibilityFlags: ["nodejs_compat"],
    entrypoint: "src/server/index.ts",
    observability: {
      enabled: true,
    },
    domains: ["spotistats.otbeaumont.me"],
    triggers: [
      triggers.scheduled({
        schedule: "*/15 * * * *",
      }),
      triggers.queue({
        maxBatchSize: 10,
        maxBatchTimeout: 30,
        name: "spotistats",
      }),
    ],
    env: {
      VITE_SPOTIFY_CLIENT_ID: bindings.text("1107a25b98c041bb90c9063553e5f1a8"),
      SPOTIFY_CLIENT_SECRET: bindings.secret(),
      DB: bindings.d1({
        name: "spotistats",
        id: "7529dabd-7b6d-42f6-ac94-ddc3db1332ab",
      }),
      SPOTIFY_SYNC_QUEUE: bindings.queue({
        name: "spotistats",
      }),
    },
  },
});
