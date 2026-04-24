import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import posthog from "posthog-js";
import { createSignal, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { accessToken, clearStoredState, linkToUri, profileCache, setProfileCache } from "~/lib/storage";
import { hasSpotifyCallbackCode, useSpotifyFetch } from "~/lib/spotify";

type SpotifyProfile = { id: string; display_name: string; email?: string; uri: string; external_urls: { spotify: string }; followers: { total: number }; images: { url: string }[]; };

export default function Profile() {
  const navigate = useNavigate();
  const spotifyFetch = useSpotifyFetch();
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    setMounted(true);
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt10/login", { replace: true });
  });

  const profile = createQuery(() => ({
    queryKey: ["spotify", "profile", accessToken()],
    enabled: !isServer && mounted() && !!accessToken(),
    queryFn: async () => {
      const cached = profileCache();
      if (cached?.displayName && cached.followers !== undefined) return cached;
      const data = await spotifyFetch<SpotifyProfile>("https://api.spotify.com/v1/me");
      posthog.identify(data.id, { name: data.display_name, email: data.email });
      const next = { icon: data.images[0]?.url, url: linkToUri() ? data.uri : data.external_urls.spotify, displayName: data.display_name, followers: data.followers.total };
      setProfileCache(next);
      return next;
    },
  }));

  const current = () => mounted() ? profile.data ?? profileCache() : null;
  const logout = () => { clearStoredState(); navigate("/attempt10/login"); };

  return (
    <div class="min-h-screen flex flex-col" style="background: #000; color: white">
      <Title>Spotistats | Profile</Title>
      <header class="px-6 py-4 flex items-center justify-between" style="border-bottom: 1px solid #1c1c1e">
        <span class="font-semibold text-base tracking-tight">Spotistats</span>
        <nav class="flex gap-6">
          <A href="/attempt10" class="text-sm font-medium" style="color: white">Profile</A>
          <A href="/attempt10/favourites" class="text-sm transition hover:text-white" style="color: rgba(255,255,255,0.4)">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs font-medium transition hover:opacity-60" style="color: rgba(255,255,255,0.3)">Sign out</button>
      </header>
      <main class="flex-1 flex items-center justify-center px-6 py-16">
        <Show when={current()} fallback={<p class="text-sm animate-pulse" style="color: rgba(255,255,255,0.2)">Loading...</p>}>
          {user => (
            <div class="text-center max-w-xs w-full">
              <a href={user().url} target="_blank" rel="noopener">
                <img
                  src={user().icon ?? "/assets/placeholder.svg"}
                  alt={user().displayName ?? "Profile"}
                  class="mx-auto h-28 w-28 rounded-[2rem] object-cover mb-6"
                  style="border: 1px solid #2c2c2e"
                />
              </a>
              <h1 class="text-2xl font-semibold tracking-tight mb-1">{user().displayName}</h1>
              <p class="text-sm mb-10" style="color: rgba(255,255,255,0.4)">{user().followers?.toLocaleString()} followers</p>
              <div class="rounded-2xl p-4" style="background: #1c1c1e">
                <A href="/attempt10/favourites" class="flex items-center justify-between text-sm font-medium transition hover:opacity-70">
                  <span>Your Top Music</span>
                  <span style="color: rgba(255,255,255,0.4)">→</span>
                </A>
              </div>
            </div>
          )}
        </Show>
      </main>
    </div>
  );
}
