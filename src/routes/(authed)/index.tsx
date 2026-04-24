import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { createSignal, For, onMount, Show } from "solid-js";
import { authStore } from "~/lib/storage";
import { profileQueryOptions, SpotifyUnauthenticatedError, statsStatusQueryOptions } from "~/lib/spotify";

function formatDate(value: number | string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function Page() {
  const [hydrated, setHydrated] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);

  onMount(() => setHydrated(true));

  const profile = createQuery(() => profileQueryOptions);
  const stats = createQuery(() => statsStatusQueryOptions);

  const current = () => {
    const store = authStore();
    return profile.data ?? (hydrated() && store.status === "authenticated" ? store.profile : null);
  };

  async function refreshListening() {
    if (refreshing()) return;
    setRefreshing(true);
    try {
      const store = authStore();
      const res = await fetch("/api/account/stats", {
        method: "POST",
        headers: {
          Authorization: store.status === "authenticated" ? store.accessToken : "",
        },
      });
      if (res.status === 401) throw new SpotifyUnauthenticatedError();
      if (!res.ok) throw new Error(`Refresh stats failed: ${res.status}`);
      await stats.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main class="app-main flex-1 p-8 md:p-16">
      <Title>Spotistats</Title>
      <Show
        when={current()}
        fallback={
          <p class="text-sm uppercase tracking-widest text-[#999]">
            LOADING_
          </p>
        }
      >
        {(user) => (
          <div class={`grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)] transition-opacity ${profile.isFetching ? "opacity-45" : "opacity-100"}`}>
            <section class="flex flex-col md:flex-row gap-10 items-start">
            <a href={user().url} target="_blank" rel="noopener">
              <img
                src={user().icon ?? "/assets/placeholder.svg"}
                alt={user().displayName ?? "Profile"}
                class="h-36 w-36 object-cover border-4 border-[#0a0a0a]"
              />
            </a>
            <div>
              <div class="text-xs uppercase tracking-[0.2em] mb-3 text-[#999]">
                User Profile
              </div>
              <h1 class="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-3">
                {user().displayName}
              </h1>
              <p class="text-xs uppercase tracking-widest mb-3 text-[#666]">
                {user().email}
              </p>
              <div class="flex items-center gap-3 mb-8">
                <span class="text-sm font-bold">
                  {user().followers?.toLocaleString()}
                </span>
                <span
                  class="text-xs uppercase tracking-widest text-[#666]"
                >
                  followers
                </span>
              </div>
              <A
                href="/favourites/tracks"
                class="inline-block border-4 border-[#0a0a0a] font-black text-sm uppercase px-6 py-3 tracking-wide transition hover:border-[#1DB954] hover:bg-[#1DB954] hover:text-black"
              >
                See Top Music →
              </A>
            </div>
            </section>
            <aside class="border-4 border-[#0a0a0a] p-5">
              <div class="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div class="mb-3 text-xs uppercase tracking-[0.2em] text-[#999]">
                    Recently Listened
                  </div>
                  <p class="text-xs uppercase tracking-widest text-[#666]">
                    {stats.data?.lastSuccessAt ? `Last sync ${formatDate(stats.data.lastSuccessAt)}` : "Spotify stats"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={refreshing() || !stats.data?.enabled}
                  onClick={refreshListening}
                  class="shrink-0 border-[3px] border-[#0a0a0a] px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest transition disabled:opacity-40 hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                >
                  {refreshing() ? "Queued_" : "Refresh"}
                </button>
              </div>
              <Show
                when={stats.data?.enabled}
                fallback={
                  <div class="bg-[#0a0a0a] p-5 text-[#f0ede8]">
                    <p class="mb-2 text-sm font-black uppercase tracking-tight">
                      Listening stats are disabled
                    </p>
                    <p class="text-sm leading-7 text-[#c9c4bb]">
                      Connect Spotify stats from your account page to build a recent listening history here.
                    </p>
                    <A href="/account" class="mt-4 inline-block text-xs font-black uppercase tracking-widest underline">
                      Open Account →
                    </A>
                  </div>
                }
              >
                <Show
                  when={(stats.data?.recent.length ?? 0) > 0}
                  fallback={
                    <div class="border-[3px] border-dashed border-[#0a0a0a] p-5">
                      <p class="mb-2 text-sm font-black uppercase tracking-tight">
                        No listening data yet
                      </p>
                      <p class="text-sm leading-7 text-[#555]">
                        Your stats sync is enabled. Use Refresh to queue a sync, then this list will update when Spotify returns recent plays.
                      </p>
                    </div>
                  }
                >
                  <div>
                    <For each={stats.data?.recent ?? []}>
                      {(item) => (
                        <a
                          href={item.external_url ?? "#"}
                          target="_blank"
                          rel="noopener"
                          class="flex items-center gap-4 border-b-[3px] border-[#0a0a0a] py-3 text-left transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                        >
                          <img
                            src={item.image_url ?? "/assets/placeholder.svg"}
                            alt={item.name}
                            class="h-10 w-10 shrink-0 border-2 border-[#0a0a0a] object-cover"
                          />
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-black uppercase tracking-tight">
                              {item.name}
                            </p>
                            <p class="mt-0.5 truncate text-xs text-[#888]">
                              {item.artist_names}
                            </p>
                            <p class="mt-1 text-[0.65rem] uppercase tracking-widest text-[#999]">
                              {formatDate(item.played_at)}
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
        )}
      </Show>
    </main>
  );
}
