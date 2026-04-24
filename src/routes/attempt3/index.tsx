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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt3/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt3/login"); };

  return (
    <div class="min-h-screen" style="background: #f5f4f0; color: #1a1a1a">
      <Title>Spotistats | Profile</Title>
      <header class="px-8 py-5 flex items-center justify-between" style="border-bottom: 1px solid #e5e3de">
        <span class="font-black tracking-tight" style="color: #1a1a1a">Spotistats</span>
        <nav class="flex gap-8 text-sm" style="color: #777">
          <A href="/attempt3" class="font-medium" style="color: #1a1a1a">Profile</A>
          <A href="/attempt3/favourites" class="hover:text-black transition" style="color: #777">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs transition hover:opacity-70" style="color: #aaa">Sign out</button>
      </header>
      <main class="max-w-lg mx-auto px-8 py-20 text-center">
        <Show when={current()} fallback={<p class="text-sm" style="color: #bbb">Loading...</p>}>
          {user => (
            <div>
              <a href={user().url} target="_blank" rel="noopener">
                <img
                  src={user().icon ?? "/assets/placeholder.svg"}
                  alt={user().displayName ?? "Profile"}
                  class="mx-auto h-28 w-28 rounded-full object-cover mb-6"
                  style="border: 2px solid #e5e3de"
                />
              </a>
              <h1 class="text-3xl font-black tracking-tight">{user().displayName}</h1>
              <p class="mt-2 text-sm" style="color: #999">{user().followers?.toLocaleString()} followers on Spotify</p>
              <div class="mt-10" style="border-top: 1px solid #e5e3de; padding-top: 2rem">
                <A href="/attempt3/favourites" class="text-sm font-medium transition hover:opacity-70" style="color: #1DB954">
                  View your top music →
                </A>
              </div>
            </div>
          )}
        </Show>
      </main>
    </div>
  );
}
