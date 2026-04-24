import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { createSignal, onMount, Show } from "solid-js";
import { authStore } from "~/lib/storage";
import { profileQueryOptions } from "~/lib/spotify";

export default function Page() {
  const [hydrated, setHydrated] = createSignal(false);

  onMount(() => setHydrated(true));

  const profile = createQuery(() => profileQueryOptions);

  const current = () => {
    const store = authStore();
    return profile.data ?? (hydrated() && store.status === "authenticated" ? store.profile : null);
  };

  return (
    <main class="app-main flex-1 p-8 md:p-16">
      <Title>Spotistats | Profile</Title>
      <Show
        when={current()}
        fallback={
          <p class="text-sm uppercase tracking-widest text-[#999]">
            LOADING_
          </p>
        }
      >
        {(user) => (
          <div class={`flex flex-col md:flex-row gap-10 items-start transition-opacity ${profile.isFetching ? "opacity-45" : "opacity-100"}`}>
            <a href={user().url} target="_blank" rel="noopener">
              <img
                src={user().icon ?? "/assets/placeholder.svg"}
                alt={user().displayName ?? "Profile"}
                class="h-36 w-36 object-cover border-4 border-[#0a0a0a]"
              />
            </a>
            <div>
              <div
                class="text-xs uppercase tracking-[0.2em] mb-3 text-[#999]"
              >
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
          </div>
        )}
      </Show>
    </main>
  );
}
