/// <reference types="@solidjs/start/env" />

interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "@solidjs/start/server/entry" {
  const handler: ExportedHandler;
  export default handler;
}
