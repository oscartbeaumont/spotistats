import type { JSX } from "@solidjs/web";

/**
 * Shared chrome for the public policy pages.
 *
 * These pages are readable without a Spotify session, so they carry the same
 * minimal header as the sign-in screen instead of the authenticated nav.
 */
export function LegalLayout(props: {
  title: string;
  updated: string;
  children: JSX.Element;
}) {
  return (
    <div class="flex min-h-screen flex-col">
      <header class="flex items-center justify-between border-b-4 border-[#0a0a0a] p-5">
        <a href="/" class="font-black text-xl tracking-tighter uppercase">
          SPOTISTATS
        </a>
        <nav class="flex items-center gap-5 text-[0.65rem] uppercase tracking-[0.2em] text-[#5c5c5c]">
          <a href="/privacy" class="hover:underline">
            Privacy
          </a>
          <a href="/security" class="hover:underline">
            Security
          </a>
        </nav>
      </header>

      <main class="mx-auto w-full max-w-3xl p-5 py-10 md:p-10">
        <div class="text-[0.65rem] uppercase tracking-[0.25em] text-[#5c5c5c]">
          Last updated {props.updated}
        </div>
        <h1 class="mt-3 text-4xl font-black uppercase leading-none tracking-tighter md:text-5xl">
          {props.title}
        </h1>
        <div class="mt-8 space-y-8 text-sm leading-7 text-[#333]">
          {props.children}
        </div>
      </main>

      <footer class="border-t-4 border-[#0a0a0a] p-5 text-[0.65rem] uppercase tracking-[0.2em] text-[#5c5c5c]">
        <div class="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3">
          <span>Created by Oscar Beaumont</span>
          <a href="/" class="hover:underline">
            Back to Spotistats →
          </a>
        </div>
      </footer>
    </div>
  );
}
