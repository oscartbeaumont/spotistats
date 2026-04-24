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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt8/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt8/login"); };

  return (
    <div class="min-h-screen relative overflow-hidden" style="background: #020810; color: white">
      <Title>Spotistats | Profile</Title>
      <div class="fixed inset-0 pointer-events-none">
        <div class="absolute" style="top: -10%; left: -5%; width: 50%; height: 50%; background: radial-gradient(circle, rgba(29,185,84,0.12) 0%, transparent 70%); filter: blur(60px)" />
        <div class="absolute" style="bottom: -10%; right: -5%; width: 50%; height: 50%; background: radial-gradient(circle, rgba(100,220,200,0.08) 0%, transparent 70%); filter: blur(60px)" />
      </div>
      <header class="relative z-10 px-6 py-4 flex items-center justify-between" style="background: rgba(2,8,16,0.7); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.05)">
        <div class="flex items-center gap-2.5">
          <div class="w-6 h-6 rounded-lg flex items-center justify-center" style="background: linear-gradient(135deg, #1DB954, #0f7a35)">
            <span class="text-black font-black text-xs">S</span>
          </div>
          <span class="font-bold text-sm">Spotistats</span>
        </div>
        <nav class="flex gap-6 text-sm">
          <A href="/attempt8" class="font-medium" style="color: #1DB954">Profile</A>
          <A href="/attempt8/favourites" class="hover:text-white transition" style="color: rgba(255,255,255,0.4)">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs transition hover:opacity-70" style="color: rgba(255,255,255,0.3)">Logout</button>
      </header>
      <main class="relative z-10 flex items-center justify-center min-h-[85vh] px-4">
        <Show when={current()} fallback={<p class="text-sm animate-pulse" style="color: rgba(29,185,84,0.5)">Loading...</p>}>
          {user => (
            <div class="text-center max-w-sm">
              <a href={user().url} target="_blank" rel="noopener" class="inline-block mb-8">
                <img
                  src={user().icon ?? "/assets/placeholder.svg"}
                  alt={user().displayName ?? "Profile"}
                  class="mx-auto h-32 w-32 rounded-2xl object-cover"
                  style="box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 0 60px rgba(29,185,84,0.2), 0 20px 40px rgba(0,0,0,0.5)"
                />
              </a>
              <h1 class="text-3xl font-bold mb-2">{user().displayName}</h1>
              <p class="text-sm mb-10" style="color: rgba(255,255,255,0.35)">{user().followers?.toLocaleString()} followers</p>
              <A
                href="/attempt8/favourites"
                class="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition hover:scale-[1.02]"
                style="background: rgba(29,185,84,0.12); border: 1px solid rgba(29,185,84,0.25); color: #1DB954; box-shadow: 0 0 20px rgba(29,185,84,0.08)"
              >
                View Top Music
                <span>→</span>
              </A>
            </div>
          )}
        </Show>
      </main>
    </div>
  );
}
