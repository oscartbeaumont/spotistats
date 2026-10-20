import { For } from "solid-js";

import { siteFaq } from "~/lib/seo";

const features = [
  {
    title: "Listening history that lasts",
    detail:
      "Spotify only shows a short recent window. Spotistats keeps a running history so your stats build over time.",
  },
  {
    title: "Top artists & tracks",
    detail:
      "All-time favourites, monthly obsessions, and the tracks you keep coming back to.",
  },
  {
    title: "Streaks & listening habits",
    detail:
      "Listening streaks, hourly patterns, weekdays, and the shape of your year.",
  },
  {
    title: "Backup & export",
    detail:
      "Download your playlists as CSV, or export every listen Spotistats stores as JSON or CSV.",
  },
  {
    title: "Opt-in and private",
    detail:
      "Stats sync is your choice. Your listening history stays yours, and you can delete it at any time.",
  },
  {
    title: "Free, with no ads",
    detail: "A focused dashboard for your music, not another feed.",
  },
];

/** Public, indexable product copy shown below the sign-in screen. */
export function SeoContent(props: {
  onConnect: () => void;
  signingIn: boolean;
}) {
  return (
    <section
      aria-labelledby="about-spotistats"
      class="border-t-4 border-[#0a0a0a] px-5 py-14 md:px-10 lg:px-12"
    >
      <div class="mx-auto grid w-full max-w-[1440px] gap-12 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <div>
          <div class="text-[0.65rem] uppercase tracking-[0.25em] text-[#5c5c5c]">
            About Spotistats
          </div>
          <h2
            id="about-spotistats"
            class="mt-3 max-w-4xl text-3xl font-black uppercase leading-none tracking-tighter md:text-5xl"
          >
            Spotify listening stats that last longer than Wrapped.
          </h2>
          <p class="mt-5 max-w-3xl text-sm leading-7 text-[#555]">
            Spotistats is a free Spotify stats app and listening-history
            tracker. Spotify shows a short recently-played list and a yearly
            Wrapped recap; Spotistats keeps the long view: your top artists and
            tracks over time, listening streaks, hourly habits, and the shape of
            your year. Back up your playlists and export the listening data it
            stores whenever you want.
          </p>

          <div class="mt-8 grid gap-3 sm:grid-cols-2">
            <For each={features}>
              {(feature) => (
                <div class="border-[3px] border-[#0a0a0a] p-4">
                  <h3 class="text-xs font-black uppercase tracking-widest">
                    {feature.title}
                  </h3>
                  <p class="mt-2 text-xs leading-6 text-[#5c5c5c]">
                    {feature.detail}
                  </p>
                </div>
              )}
            </For>
          </div>
        </div>

        <div>
          <div class="text-[0.65rem] uppercase tracking-[0.25em] text-[#5c5c5c]">
            Frequently asked questions
          </div>
          <h2 class="mt-3 text-2xl font-black uppercase leading-none tracking-tighter md:text-3xl">
            Spotify stats, answered.
          </h2>
          <div class="mt-6 space-y-3">
            <For each={siteFaq}>
              {(item) => (
                <div class="border-[3px] border-[#0a0a0a] p-4">
                  <h3 class="text-xs font-black uppercase tracking-wide">
                    {item.question}
                  </h3>
                  <p class="mt-2 text-xs leading-6 text-[#5c5c5c]">
                    {item.answer}
                  </p>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      <div class="mx-auto mt-12 flex w-full max-w-[1440px] flex-col gap-5 border-4 border-[#0a0a0a] bg-[#1DB954] p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div>
          <div class="text-[0.65rem] font-black uppercase tracking-[0.2em]">
            Your music, with receipts
          </div>
          <p class="mt-2 max-w-2xl text-lg font-black uppercase leading-tight tracking-tight md:text-2xl">
            Connect Spotify and see your listening history take shape.
          </p>
        </div>
        <button
          type="button"
          disabled={props.signingIn}
          onClick={props.onConnect}
          class="shrink-0 border-4 border-[#0a0a0a] bg-[#0a0a0a] px-6 py-3 text-sm font-black uppercase tracking-wide text-[#f0ede8] transition hover:bg-[#f0ede8] hover:text-[#0a0a0a] disabled:opacity-60"
        >
          {props.signingIn ? "CONNECTING_" : "CONNECT SPOTIFY →"}
        </button>
      </div>
    </section>
  );
}
