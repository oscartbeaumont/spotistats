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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt1/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt1/login"); };

  return (
    <div class="min-h-screen" style="background: radial-gradient(ellipse at 50% -10%, rgba(29,185,84,0.18) 0%, #07090f 55%)">
      <Title>Spotistats | Profile</Title>
      <header class="sticky top-0 z-10 px-6 py-4 flex items-center justify-between" style="background: rgba(7,9,15,0.85); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.06)">
        <span class="font-black text-[#1DB954] text-lg tracking-tight">spotistats</span>
        <nav class="flex gap-6 text-sm">
          <A href="/attempt1" class="text-white font-medium">Profile</A>
          <A href="/attempt1/favourites" class="text-zinc-400 hover:text-white transition">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs text-zinc-600 hover:text-zinc-300 transition">Logout</button>
      </header>
      <main class="flex items-center justify-center min-h-[85vh] px-4">
        <Show when={current()} fallback={<p class="text-zinc-700 animate-pulse">Loading...</p>}>
          {user => (
            <div class="text-center">
              <a href={user().url} target="_blank" rel="noopener" class="inline-block">
                <img
                  src={user().icon ?? "/assets/placeholder.svg"}
                  alt={user().displayName ?? "Profile"}
                  class="mx-auto h-32 w-32 rounded-full object-cover mb-6"
                  style="box-shadow: 0 0 0 3px #1DB954, 0 0 0 8px rgba(29,185,84,0.15), 0 0 40px rgba(29,185,84,0.2)"
                />
              </a>
              <h1 class="text-3xl font-bold text-white">{user().displayName}</h1>
              <p class="text-zinc-500 mt-2 text-sm">{user().followers?.toLocaleString()} followers</p>
              <A
                href="/attempt1/favourites"
                class="mt-8 inline-block rounded-full px-6 py-2.5 text-sm text-[#1DB954] transition hover:bg-[#1DB954]/10"
                style="border: 1px solid rgba(29,185,84,0.3)"
              >
                View Top Music →
              </A>
            </div>
          )}
        </Show>
      </main>
    </div>
  );
}
