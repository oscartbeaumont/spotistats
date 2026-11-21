/// <reference types="vite/client" />

/**
 * Vite inlines `import.meta.env` at build time. Only the variables the Worker
 * supplies are declared here; the rest of the environment is untyped on
 * purpose so a new variable is a deliberate change.
 */
interface ImportMetaEnv {
  /** The Spotify application's public client id, set in `cloudflare.config.ts`. */
  readonly VITE_SPOTIFY_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
