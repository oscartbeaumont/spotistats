import { Title } from "@solidjs/meta";
import {
  action,
  createEffect,
  createMemo,
  createSignal,
  For,
  isPending,
  latest,
  Loading,
  onSettled,
  Show,
} from "solid-js";

import { accountApi } from "~/client/api";
import { identifyUser } from "~/client/analytics";
import { getCurrentlyPlaying, getProfile, runSpotify } from "~/client/spotify";
import { setAuthStore } from "~/client/storage";
import { formatDate } from "~/lib/format";
import { createShortcut, isEditableShortcutTarget } from "~/lib/shortcut";
import { errorMessage } from "~/lib/errors";
import { externalHref } from "~/lib/url";
import type { TrackingStatus } from "~/api";

const fetchStatus = async (): Promise<TrackingStatus> => {
  try {
    return await accountApi.status();
  } catch (error) {
    return {
      enabled: false,
      consentedAt: null,
      lastReadAt: null,
      disabledAt: null,
      lastPlayedAtMs: null,
      lastSuccessAt: null,
      lastError: errorMessage(error),
      listenCount: 0,
      recent: [],
    };
  }
};

export default function ProfilePage() {
  const [tick, setTick] = createSignal(0);

  const profile = createMemo(() => runSpotify(getProfile()));
  const stats = createMemo(() => {
    tick();
    return fetchStatus();
  });
  const currentlyPlaying = createMemo(() => {
    tick();
    return runSpotify(getCurrentlyPlaying());
  });

  onSettled(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 10000);
    return () => clearInterval(interval);
  });

  createEffect(
    () => profile(),
    (data) => {
      if (!data) return;
      const displayName = data.display_name ?? data.id;
      identifyUser(data.id, {
        username: displayName,
        email: data.email,
      });
      setAuthStore((current) =>
        current.status === "authenticated"
          ? {
              ...current,
              profile: {
                icon: data.images?.[0]?.url,
                url:
                  current.linkToUri && data.uri
                    ? data.uri
                    : data.external_urls.spotify,
                displayName,
                email: data.email,
                followers: data.followers.total,
              },
            }
          : current,
      );
    },
  );

  const [refreshing, setRefreshing] = createSignal(false);
  const queueRefresh = action(function* () {
    yield accountApi.refresh();
    setTick((value) => value + 1);
  });
  const refreshStats = async () => {
    if (refreshing() || !latest(stats)?.enabled) return;
    setRefreshing(true);
    try {
      await queueRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  createShortcut(
    ["r"],
    (event) => {
      if (isEditableShortcutTarget(event)) return;
      void refreshStats();
    },
    { preventDefault: false },
  );

  return (
    <main class="app-main flex-1 p-8 md:p-16">
      <Title>Spotistats</Title>
      <Loading fallback={<p class="text-sm uppercase tracking-widest text-[#5c5c5c]">LOADING_</p>}>
        <Show
          when={profile()}
          fallback={
            <p class="text-sm uppercase tracking-widest text-[#5c5c5c]">LOADING_</p>
          }
        >
          {(user) => (
            <div class="space-y-8">
              <Show
                when={currentlyPlaying()?.is_playing && currentlyPlaying()?.item}
              >
                {(track) => (
                  <a
                    href={externalHref(track().external_urls.spotify)}
                    target="_blank"
                    rel="noopener"
                    class="group flex items-center gap-4 border-4 border-[#0a0a0a] bg-[#1DB954] p-4 text-[#0a0a0a] shadow-[8px_8px_0_#0a0a0a] transition hover:-translate-y-0.5 hover:shadow-[10px_10px_0_#0a0a0a]"
                  >
                    <img
                      src={
                        track().album?.images?.[0]?.url ??
                        track().images?.[0]?.url ??
                        "/assets/placeholder.svg"
                      }
                      alt={track().name}
                      class="h-16 w-16 shrink-0 border-[3px] border-[#0a0a0a] object-cover"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="mb-1 text-[0.65rem] font-black uppercase tracking-[0.25em]">
                        Playing Now
                      </div>
                      <p class="truncate text-xl font-black uppercase tracking-tight md:text-2xl">
                        {track().name}
                      </p>
                      <p class="truncate text-xs font-bold uppercase tracking-widest opacity-75">
                        {track()
                          .artists?.map((artist) => artist.name)
                          .join(", ") ?? "Spotify"}
                      </p>
                    </div>
                    <span class="hidden shrink-0 border-[3px] border-[#0a0a0a] px-3 py-2 text-xs font-black uppercase tracking-widest transition group-hover:bg-[#0a0a0a] group-hover:text-[#1DB954] md:inline-block">
                      Open Spotify →
                    </span>
                  </a>
                )}
              </Show>
              <div
                class={`grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)] transition-opacity ${
                  isPending(profile) ||
                  isPending(currentlyPlaying) ||
                  isPending(stats)
                    ? "opacity-45"
                    : "opacity-100"
                }`}
              >
                <section class="flex flex-col md:flex-row gap-10 items-start">
                  <a href={externalHref(user().external_urls.spotify)} target="_blank" rel="noopener">
                    <img
                      src={user().images?.[0]?.url ?? "/assets/placeholder.svg"}
                      alt={user().display_name ?? "Profile"}
                      class="h-36 w-36 object-cover border-4 border-[#0a0a0a]"
                    />
                  </a>
                  <div>
                    <div class="text-xs uppercase tracking-[0.2em] mb-3 text-[#5c5c5c]">
                      User Profile
                    </div>
                    <h1 class="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-3">
                      {user().display_name ?? user().id}
                    </h1>
                    <p class="text-xs uppercase tracking-widest mb-3 text-[#666]">
                      {user().email}
                    </p>
                    <div class="flex items-center gap-3 mb-8">
                      <span class="text-sm font-bold">
                        {user().followers.total.toLocaleString()}
                      </span>
                      <span class="text-xs uppercase tracking-widest text-[#666]">
                        followers
                      </span>
                    </div>
                    <a
                      href="/favourites/tracks"
                      class="inline-block border-4 border-[#0a0a0a] font-black text-sm uppercase px-6 py-3 tracking-wide transition hover:border-[#1DB954] hover:bg-[#1DB954] hover:text-black"
                    >
                      See Top Music →
                    </a>
                  </div>
                </section>
                <aside class="border-4 border-[#0a0a0a] p-5">
                  <div class="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <div class="mb-3 text-xs uppercase tracking-[0.2em] text-[#5c5c5c]">
                        Recently Listened
                      </div>
                      <p class="text-xs uppercase tracking-widest text-[#666]">
                        {stats().lastSuccessAt
                          ? `Last sync ${formatDate(stats().lastSuccessAt)}`
                          : "Spotify stats"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={refreshing() || !stats().enabled}
                      onClick={refreshStats}
                      class="shrink-0 border-[3px] border-[#0a0a0a] px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest transition disabled:opacity-40 hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                      title="Shortcut: R"
                    >
                      {refreshing() ? "Queued_" : "Refresh (R)"}
                    </button>
                  </div>
                  <Show
                    when={stats().enabled}
                    fallback={
                      <div class="bg-[#0a0a0a] p-5 text-[#f0ede8]">
                        <p class="mb-2 text-sm font-black uppercase tracking-tight">
                          Listening stats are disabled
                        </p>
                        <p class="text-sm leading-7 text-[#c9c4bb]">
                          Connect Spotify stats from your account page to build a
                          recent listening history here.
                        </p>
                        <a
                          href="/account"
                          class="mt-4 inline-block text-xs font-black uppercase tracking-widest underline"
                        >
                          Open Account →
                        </a>
                      </div>
                    }
                  >
                    <Show
                      when={stats().recent.length > 0}
                      fallback={
                        <div class="border-[3px] border-dashed border-[#0a0a0a] p-5">
                          <p class="mb-2 text-sm font-black uppercase tracking-tight">
                            No listening data yet
                          </p>
                          <p class="text-sm leading-7 text-[#555]">
                            Your stats sync is enabled. Use Refresh to queue a
                            sync, then this list will update when Spotify returns
                            recent plays.
                          </p>
                        </div>
                      }
                    >
                      <div>
                        <For each={stats().recent}>
                          {(item) => (
                            <a
                              href={externalHref(item.externalUrl) ?? "#"}
                              target="_blank"
                              rel="noopener"
                              class="flex items-center gap-4 border-b-[3px] border-[#0a0a0a] py-3 text-left transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                            >
                              <img
                                src={item.imageUrl ?? "/assets/placeholder.svg"}
                                alt={item.name}
                                class="h-10 w-10 shrink-0 border-2 border-[#0a0a0a] object-cover"
                              />
                              <div class="min-w-0 flex-1">
                                <p class="truncate text-sm font-black uppercase tracking-tight">
                                  {item.name}
                                </p>
                                <p class="mt-0.5 truncate text-xs text-[#5c5c5c]">
                                  {item.artistNames}
                                </p>
                                <p class="mt-1 text-[0.65rem] uppercase tracking-widest text-[#5c5c5c]">
                                  {formatDate(item.playedAt)}
                                </p>
                              </div>
                            </a>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>
                </aside>
              </div>
            </div>
          )}
        </Show>
      </Loading>
    </main>
  );
}
