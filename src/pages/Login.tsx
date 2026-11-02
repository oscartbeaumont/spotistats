import { useLocation, useNavigate } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";

import { capture } from "~/client/analytics";
import { createLoginUrl, loginError } from "~/client/auth";
import { authReady, authStore } from "~/client/storage";
import { SeoContent } from "~/components/SeoContent";
import { isPublicPath } from "~/lib/seo";

const steps = [
  "Connect your Spotify account",
  "Opt in to listening stats",
  "See the shape of your year",
];

const timeBars = [18, 28, 22, 42, 34, 50, 30, 58, 44, 62, 38, 54, 26, 46, 34, 58];
const hourBars = [
  22, 15, 10, 8, 6, 5, 9, 20, 36, 42, 38, 44, 40, 35, 31, 33, 41, 52, 68, 78,
  72, 61, 44, 29,
];
const streakDays = [1, 1, 0, 1, 1, 1, 1];

/** Decorative sample data. It is never fetched or persisted. */
function SampleTeaser() {
  return (
    <div
      aria-hidden="true"
      class="relative mx-auto w-full max-w-[700px] xl:aspect-[700/640]"
    >
      <div class="absolute inset-x-10 inset-y-6 hidden rotate-3 bg-[#1DB954] xl:block" />
      <div class="relative grid grid-cols-2 gap-3 xl:block xl:h-full">
        <div class="col-span-2 flex flex-col border-4 border-[#0a0a0a] bg-[#f0ede8] p-4 shadow-[8px_8px_0_#0a0a0a] xl:absolute xl:left-0 xl:top-[2%] xl:h-[34%] xl:w-[58%] xl:-rotate-2">
          <div class="text-[0.6rem] font-black uppercase tracking-[0.2em] text-[#5c5c5c]">
            Listening time
          </div>
          <div class="mt-1 text-4xl font-black leading-none tracking-tighter xl:text-5xl">
            302.1H
          </div>
          <div class="mt-1 text-[0.55rem] uppercase tracking-widest text-[#5c5c5c]">
            Across 214 active days
          </div>
          <div class="mt-3 flex min-h-12 flex-1 items-end gap-1">
            <For each={timeBars}>
              {(height) => (
                <div
                  class="flex-1 bg-[#0a0a0a]"
                  style={`height:${height}%`}
                />
              )}
            </For>
          </div>
        </div>

        <div class="col-span-1 flex flex-col justify-between border-4 border-[#0a0a0a] bg-[#1DB954] p-4 shadow-[8px_8px_0_#0a0a0a] xl:absolute xl:left-[51%] xl:top-[17%] xl:h-[27%] xl:w-[43%] xl:rotate-2">
          <div>
            <div class="text-[0.55rem] font-black uppercase tracking-[0.2em]">
              Top artist
            </div>
            <div class="mt-1 text-xl font-black uppercase leading-none tracking-tighter xl:text-2xl">
              Aurora Vale
            </div>
            <div class="mt-2 text-[0.6rem] font-black uppercase tracking-widest">
              412 plays
            </div>
          </div>
          <div class="mt-3 hidden h-10 w-10 shrink-0 items-center justify-center self-end rounded-full border-[3px] border-[#0a0a0a] xl:flex">
            <div class="h-4 w-4 rounded-full border-[3px] border-[#0a0a0a]" />
          </div>
        </div>

        <div class="col-span-1 flex flex-col border-4 border-[#0a0a0a] bg-[#f0ede8] p-4 shadow-[8px_8px_0_#0a0a0a] xl:absolute xl:left-0 xl:top-[47%] xl:h-[27%] xl:w-[43%] xl:rotate-1">
          <div class="text-[0.55rem] font-black uppercase tracking-[0.2em] text-[#5c5c5c]">
            Listening streak
          </div>
          <div class="mt-1 text-2xl font-black leading-none tracking-tighter xl:text-3xl">
            12 Days
          </div>
          <div class="mt-3 flex gap-1.5">
            <For each={streakDays}>
              {(on) => (
                <div
                  class={`aspect-square flex-1 border-2 border-[#0a0a0a] ${
                    on ? "bg-[#0a0a0a]" : ""
                  }`}
                />
              )}
            </For>
          </div>
        </div>

        <div class="col-span-2 flex flex-col border-4 border-[#0a0a0a] bg-[#0a0a0a] p-4 text-[#f0ede8] shadow-[8px_8px_0_#0a0a0a] xl:absolute xl:left-[45%] xl:top-[55%] xl:h-[36%] xl:w-[47%] xl:-rotate-1">
          <div class="text-[0.55rem] font-black uppercase tracking-[0.2em] text-[#1DB954]">
            When you listen
          </div>
          <div class="mt-1 text-[0.5rem] uppercase tracking-widest text-[#8a8a8a]">
            Your local hours
          </div>
          <div class="mt-3 flex min-h-16 flex-1 items-end gap-0.5 xl:gap-1">
            <For each={hourBars}>
              {(height, index) => (
                <div
                  class={`flex-1 ${
                    index() === 19 ? "bg-[#1DB954]" : "bg-[#f0ede8]"
                  }`}
                  style={`height:${height}%`}
                />
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [signingIn, setSigningIn] = createSignal(false);
  const publicPage = () => isPublicPath(location.pathname);

  createEffect(
    () => ({ ready: authReady(), status: authStore().status }),
    ({ ready, status }) => {
      if (ready && status === "authenticated") navigate("/", { replace: true });
    },
  );

  const signIn = async (source: "login_page" | "seo_cta" = "login_page") => {
    if (signingIn()) return;
    setSigningIn(true);
    capture("login_started", { source });
    try {
      localStorage.clear();
      window.location.href = await createLoginUrl(window.location.origin);
    } catch (error) {
      console.error("Could not start the Spotify login", error);
      capture("login_failed", { reason: "start_failed" });
      setSigningIn(false);
    }
  };

  return (
    <div class="flex min-h-screen flex-col">
      <header class="flex items-center justify-between border-b-4 border-[#0a0a0a] p-5">
        <span class="font-black text-xl tracking-tighter uppercase">
          SPOTISTATS
        </span>
        <span class="hidden text-[0.65rem] uppercase tracking-[0.2em] text-[#5c5c5c] sm:block">
          Created by{" "}
          <a
            href="https://otbeaumont.me"
            target="_blank"
            rel="noopener noreferrer"
            class="underline-offset-2 hover:underline"
          >
            Oscar Beaumont
          </a>
        </span>
      </header>

      <main class="p-5 py-10 md:p-10 lg:p-12">
        <div class="mx-auto grid w-full max-w-[1440px] gap-12 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:items-center xl:gap-16">
          <section class="min-w-0">
            <div class="flex items-center gap-2.5">
              <span class="h-2.5 w-2.5 bg-[#1DB954]" />
              <span class="text-[0.65rem] uppercase tracking-[0.25em] text-[#5c5c5c]">
                Your Spotify, decoded
              </span>
            </div>

            <h1 class="mt-5 text-6xl font-black uppercase leading-[0.88] tracking-[-0.055em] sm:text-7xl xl:text-[88px]">
              <span class="block">Listen.</span>
              <span class="block">Learn.</span>
              <span class="block">Repeat.</span>
            </h1>

            <p class="mt-6 max-w-[470px] text-sm leading-7 text-[#555]">
              Spotify only shows you the last few plays. Spotistats keeps the
              long view, then turns it into streaks, top artists, and the shape
              of your year.
            </p>

            <Show when={loginError()}>
              <pre
                role="alert"
                class="mt-6 max-w-[540px] whitespace-pre-wrap break-words border-4 border-[#0a0a0a] bg-[#0a0a0a] p-3 text-xs font-bold text-red-500"
              >
                Sign-in failed: {loginError()}
              </pre>
            </Show>

            <div class="mt-7 w-full max-w-[540px] border-4 border-[#0a0a0a] bg-[#f0ede8] p-5 shadow-[8px_8px_0_#0a0a0a]">
              <div class="text-[0.6rem] font-black uppercase tracking-[0.2em] text-[#5c5c5c]">
                Three steps to your stats
              </div>
              <ol class="mt-4 space-y-3">
                <For each={steps}>
                  {(step, index) => (
                    <li class="flex items-center gap-3">
                      <span
                        class={`flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[#0a0a0a] text-[0.6rem] font-black ${
                          index() === 0 ? "bg-[#1DB954]" : ""
                        }`}
                      >
                        {index() + 1}
                      </span>
                      <span class="text-[0.65rem] font-black uppercase tracking-wider">
                        {step}
                      </span>
                    </li>
                  )}
                </For>
              </ol>
              <button
                type="button"
                disabled={signingIn()}
                onClick={() => void signIn()}
                class="mt-5 flex w-full items-center justify-center gap-3 border-4 border-[#0a0a0a] bg-[#1DB954] px-4 py-3 text-xs font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#1DB954] disabled:opacity-60"
              >
                {signingIn() ? "CONNECTING_" : "CONNECT SPOTIFY"}
                <span aria-hidden="true">→</span>
              </button>
              <p class="mt-3 text-[0.6rem] leading-5 text-[#5c5c5c]">
                Stats sync is opt-in. Delete your history whenever you want.
              </p>
              <p class="mt-2 text-[0.6rem] leading-5 text-[#5c5c5c]">
                <a href="/privacy" class="underline hover:text-[#0a0a0a]">
                  Privacy
                </a>
                {" · "}
                <a href="/security" class="underline hover:text-[#0a0a0a]">
                  Security
                </a>
              </p>
            </div>
          </section>

          <section class="min-w-0">
            <SampleTeaser />
          </section>
        </div>
      </main>

      <Show when={publicPage()}>
        <SeoContent
          onConnect={() => void signIn("seo_cta")}
          signingIn={signingIn()}
        />
      </Show>
    </div>
  );
}
