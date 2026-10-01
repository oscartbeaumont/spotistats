<h1 align="center">Spotistats</h1>
<p align="center">
    <img width="156" height="156" src="public/assets/logo-256.png"></img>
</p>
<p align="center">
    Spotistats is a tool designed to analyse and backup your music on Spotify!
    <br />
    <a target="_blank" href="https://spotistats.otbeaumont.me">https://spotistats.otbeaumont.me</a>
</p>

Previously [https://spotistats.js.org].

# Stack

- [SolidJS 2](https://www.solidjs.com) with [`@solidjs/router`](https://docs.solidjs.com/solid-router) for the browser app.
- [`@solidjs/vite-plugin`](https://www.npmjs.com/package/@solidjs/vite-plugin) start mode for the entries, the document shell and server rendering. SolidStart is no longer used.
- [Effect 4](https://effect.website) for the worker. The API contract (`src/api`) is shared by both sides.
- [Vite](https://vite.dev) with the [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) for building and local development.
- [TailwindCSS](https://tailwindcss.com) for styling.
- [Cloudflare Workers](https://workers.cloudflare.com) for hosting, with D1, Queues and Cron Triggers.

# How it is put together

Start mode generates the client entry and the server entry from `src/App.tsx`
and `src/Document.tsx`. There is no `index.html` and no mount file. The browser
app talks to the worker only through the typed API in `src/api`.

The Spotify session lives in `localStorage`, so the server cannot read it. The
server renders the sign-in page; the client loads the session after hydration
and renders the matching view. This keeps server output and client hydration in
step.

```
src/
  App.tsx     App root: head tags and the router.
  Document.tsx HTML shell: site-wide head tags and the hydration script.
  api/        Shared API contract (Effect Schema + HttpApi). Imported by both sides.
  server/     Worker: Effect services, HttpApi handlers, D1, OAuth, queue and cron.
  client/     Browser data access: API client, Spotify client, auth and storage.
  pages/      Route components, loaded on demand with `lazy`.
  layout/     Shared page chrome.
```

The worker entry is `src/server/index.ts`. It imports the start-mode SSR handler
from `virtual:solid-ssr-handler`, so `src/server/middleware.ts` serves `/api/*`
and the stats OAuth routes inside the request scope. The worker adds the queue
consumer and the cron trigger, which the generated handler alone cannot carry.

The worker has two jobs:

1. It serves `/api/*` from an Effect `HttpApi` that is implemented with
   `HttpApiBuilder`. Every failure is a declared error type, so the browser
   receives the same error types the server produces.
2. It runs the listening-stats OAuth flow and the sync queue. Because the sync
   needs a refresh token, the client secret and the token stay on the worker.

Spotify requests from the browser are wrapped in `src/client/spotify.ts`. Every
response is validated with Effect Schema and every failure is a declared error.

# Usage

```bash
git clone https://github.com/oscartbeaumont/spotistats
cd spotistats/
pnpm i
pnpm dev
```

# Checks

```bash
pnpm typecheck   # TypeScript, no emit
pnpm build       # Type check, then build the client and the worker
pnpm preview     # Run the production build with the Cloudflare Vite plugin
```

# Database

Local migrations run against the local D1 database:

```bash
pnpm db:migrate:local
pnpm db:migrate:remote
```
