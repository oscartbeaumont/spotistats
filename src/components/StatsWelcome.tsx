import { For, Match, Show, Switch } from "solid-js";

import { welcomeSteps, type WelcomePhase } from "~/lib/statsWelcome";

/**
 * The screen a newly connected stats account lands on.
 *
 * Sync is asynchronous, so the first listens arrive after the OAuth callback
 * returns. This panel narrates that wait instead of leaving the profile showing
 * zeros: it starts with the connection, moves to the import, and hands over to
 * the insights as soon as there is something real to show. It is dismissible,
 * so it never becomes a permanent fixture for people who already know the page.
 */
export function StatsWelcome(props: {
  phase: WelcomePhase;
  listenCount: number;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}) {
  const title = () => {
    switch (props.phase) {
      case "connecting":
        return "Connecting your account";
      case "syncing":
        return "Importing your last 50 plays";
      case "ready":
        return "Your listening history is live";
      case "empty":
        return "No recent plays to import";
      case "slow":
        return "Still waiting on Spotify";
      case "failed":
        return "The first sync did not land";
    }
  };

  const body = () => {
    switch (props.phase) {
      case "connecting":
        return "Spotify is connected. Reading what sync has stored so far.";
      case "syncing":
        return "Your account is on. Spotify's recent-play window is coming in now, and this page fills in on its own, usually within a few seconds.";
      case "ready":
        return `${props.listenCount.toLocaleString()} ${props.listenCount === 1 ? "play" : "plays"} stored. Below is the history Spotify does not keep: top artists, listening hours, streaks and the shape of your year.`;
      case "empty":
        return "Sync ran, but Spotify had no recent plays to hand over. Play something in Spotify, then ask again.";
      case "slow":
        return "Spotify has not answered with your recent plays yet. Sync retries on its own, and you can ask again now.";
      case "failed":
        return `Nothing has been stored yet.${props.error ? ` Spotify said: ${props.error}` : ""} Try again, and if it keeps failing, the account page explains why.`;
    }
  };

  const waiting = () =>
    props.phase === "empty" ||
    props.phase === "slow" ||
    props.phase === "failed";

  return (
    <section
      aria-labelledby="stats-welcome-heading"
      class="content-fade-in border-4 border-[#0a0a0a] bg-[#1DB954] p-5 text-[#0a0a0a] shadow-[8px_8px_0_#0a0a0a] md:p-6"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-[0.65rem] font-black uppercase tracking-[0.25em]">
            Stats sync enabled
          </div>
          <h2
            id="stats-welcome-heading"
            class="mt-1 max-w-2xl text-2xl font-black uppercase leading-none tracking-tighter md:text-4xl"
          >
            {title()}
          </h2>
        </div>
        <button
          type="button"
          onClick={props.onDismiss}
          class="shrink-0 border-[3px] border-[#0a0a0a] px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#1DB954]"
        >
          Dismiss
        </button>
      </div>

      <p
        aria-live="polite"
        class="mt-3 max-w-2xl text-sm font-medium leading-7"
      >
        {body()}
      </p>

      <ol class="mt-5 grid gap-2 sm:grid-cols-3">
        <For each={welcomeSteps(props.phase)}>
          {(step) => (
            <li
              class={`flex items-center gap-2 border-[3px] border-[#0a0a0a] px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest ${
                step.state === "done"
                  ? "bg-[#0a0a0a] text-[#1DB954]"
                  : step.state === "active"
                    ? "bg-[#f0ede8]"
                    : "opacity-70"
              }`}
            >
              <span
                aria-hidden="true"
                class="grid h-5 w-5 shrink-0 place-items-center border-[2px] border-current text-[0.6rem] leading-none"
              >
                <Switch>
                  <Match when={step.state === "done"}>✓</Match>
                  <Match when={step.state === "active"}>
                    <span class="animate-pulse">•</span>
                  </Match>
                </Switch>
              </span>
              {step.label}
            </li>
          )}
        </For>
      </ol>

      <div class="mt-5 flex flex-wrap gap-3">
        <Show when={props.phase === "ready"}>
          <button
            type="button"
            onClick={() =>
              document
                .getElementById("insights")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            class="border-4 border-[#0a0a0a] bg-[#0a0a0a] px-6 py-3 text-sm font-black uppercase tracking-wide text-[#1DB954] transition hover:bg-[#f0ede8] hover:text-[#0a0a0a]"
          >
            See your insights ↓
          </button>
        </Show>
        <Show when={waiting()}>
          <button
            type="button"
            disabled={props.refreshing}
            onClick={props.onRefresh}
            class="border-4 border-[#0a0a0a] px-6 py-3 text-sm font-black uppercase tracking-wide transition disabled:opacity-50 hover:bg-[#0a0a0a] hover:text-[#1DB954]"
          >
            {props.refreshing ? "Refreshing_" : "Refresh now"}
          </button>
        </Show>
        <a
          href="/account"
          class="self-center text-[0.65rem] font-black uppercase tracking-widest underline"
        >
          Sync settings
        </a>
      </div>
    </section>
  );
}
