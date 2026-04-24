import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import posthog from "posthog-js";
import { createSignal, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import {
  accessToken,
  linkToUri,
  profileCache,
  setProfileCache,
} from "~/lib/storage";
import { useSpotifyFetch } from "~/lib/spotify";

type SpotifyProfile = {
  id: string;
  display_name: string;
  email?: string;
  uri: string;
  external_urls: { spotify: string };
  followers: { total: number };
  images: { url: string }[];
};

export default function Page() {
  const spotifyFetch = useSpotifyFetch();
  const [hydrated, setHydrated] = createSignal(false);

  onMount(() => setHydrated(true));

  const profile = createQuery(() => ({
    queryKey: ["spotify", "profile", accessToken()],
    enabled: !isServer && !!accessToken(),
    initialData: hydrated() ? profileCache() ?? undefined : undefined,
    queryFn: async () => {
      const data = await spotifyFetch<SpotifyProfile>(
        "https://api.spotify.com/v1/me",
      );
      posthog.identify(data.id, {
        username: data.display_name,
        email: data.email,
      });
      const next = {
        icon: data.images[0]?.url,
        url: linkToUri() ? data.uri : data.external_urls.spotify,
        displayName: data.display_name,
        email: data.email,
        followers: data.followers.total,
      };
      setProfileCache(next);
      return next;
    },
  }));

  const current = () => profile.data ?? (hydrated() ? profileCache() : null);

  return (
    <main class="app-main flex-1 p-8 md:p-16">
      <Title>Spotistats | Profile</Title>
      <Show
        when={current()}
        fallback={
          <p class="text-sm uppercase tracking-widest" style="color: #999">
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
                class="h-36 w-36 object-cover"
                style="border: 4px solid #0a0a0a"
              />
            </a>
            <div>
              <div
                class="text-xs uppercase tracking-[0.2em] mb-3"
                style="color: #999"
              >
                User Profile
              </div>
              <h1 class="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-3">
                {user().displayName}
              </h1>
              <p class="text-xs uppercase tracking-widest mb-3" style="color: #666">
                {user().email}
              </p>
              <div class="flex items-center gap-3 mb-8">
                <span class="text-sm font-bold">
                  {user().followers?.toLocaleString()}
                </span>
                <span
                  class="text-xs uppercase tracking-widest"
                  style="color: #666"
                >
                  followers
                </span>
              </div>
              <A
                href="/favourites"
                class="inline-block font-black text-sm uppercase px-6 py-3 tracking-wide transition hover:bg-[#1DB954] hover:text-black"
                style="border: 4px solid #0a0a0a"
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "#1DB954";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "#0a0a0a";
                }}
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
