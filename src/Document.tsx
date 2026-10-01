import { HydrationScript } from "@solidjs/web";
import type { JSX } from "@solidjs/web";

/**
 * The HTML shell for the app.
 *
 * Start mode renders this on the server and hydrates it on the client. The
 * client entry script is injected into `<head>` automatically, so the shell
 * only lists the site-wide tags and the hydration script.
 */
export default function Document(props: { children?: JSX.Element }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1DB954" />
        <meta
          name="google-site-verification"
          content="MTlWOXe7tGo0JJtX_8kPy0dSA6OOP8UasZF2X-L1Y-M"
        />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/assets/logo-256.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body>
        <noscript>
          <main class="min-h-screen bg-[#f0ede8] p-8 md:p-16 text-[#0a0a0a]">
            <section class="max-w-xl border-4 border-[#0a0a0a] bg-[#f8f5ef] p-6 shadow-[8px_8px_0_#0a0a0a]">
              <div class="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[#999]">
                JavaScript Required
              </div>
              <h1 class="mb-4 text-4xl font-black uppercase tracking-tighter">
                Spotistats needs JavaScript
              </h1>
              <p class="text-sm leading-7 text-[#555]">
                This app connects to Spotify in your browser and uses
                JavaScript to load your music data. Enable JavaScript, then
                refresh the page.
              </p>
            </section>
          </main>
        </noscript>
        {props.children}
        <HydrationScript />
      </body>
    </html>
  );
}
