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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt4/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt4/login"); };

  return (
    <div class="min-h-screen" style="background: #06060f; color: white">
      <Title>Spotistats | Profile</Title>
      <div class="fixed inset-0 overflow-hidden pointer-events-none">
        <div class="absolute top-0 left-1/3 w-[500px] h-[500px] rounded-full opacity-10" style="background: radial-gradient(circle, #ff2d78, transparent 70%); filter: blur(80px)" />
        <div class="absolute bottom-0 right-1/3 w-[500px] h-[500px] rounded-full opacity-10" style="background: radial-gradient(circle, #00f5ff, transparent 70%); filter: blur(80px)" />
      </div>
      <header class="relative z-10 px-6 py-4 flex items-center justify-between" style="border-bottom: 1px solid rgba(255,45,120,0.2)">
        <span class="font-black text-lg tracking-tight" style="color: #ff2d78; text-shadow: 0 0 15px rgba(255,45,120,0.4)">SPOTISTATS</span>
        <nav class="flex gap-8 text-sm tracking-wide uppercase">
          <A href="/attempt4" class="font-bold" style="color: #ff2d78">Profile</A>
          <A href="/attempt4/favourites" class="hover:text-white transition" style="color: rgba(255,255,255,0.4)">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs tracking-widest uppercase transition hover:opacity-70" style="color: rgba(0,245,255,0.4)">Logout</button>
      </header>
      <main class="relative z-10 flex items-center justify-center min-h-[85vh] px-4">
        <Show when={current()} fallback={<p class="text-sm animate-pulse" style="color: rgba(255,45,120,0.5)">Connecting...</p>}>
          {user => (
            <div class="text-center">
              <a href={user().url} target="_blank" rel="noopener">
                <img
                  src={user().icon ?? "/assets/placeholder.svg"}
                  alt={user().displayName ?? "Profile"}
                  class="mx-auto h-36 w-36 rounded-full object-cover mb-6"
                  style="border: 2px solid #ff2d78; box-shadow: 0 0 0 4px rgba(255,45,120,0.15), 0 0 40px rgba(255,45,120,0.3)"
                />
              </a>
              <h1 class="text-4xl font-black tracking-tight">{user().displayName}</h1>
              <p class="mt-2 text-sm tracking-widest uppercase" style="color: #00f5ff88">{user().followers?.toLocaleString()} followers</p>
              <A
                href="/attempt4/favourites"
                class="mt-10 inline-block py-2.5 px-6 text-sm font-bold tracking-widest uppercase transition"
                style="border: 1px solid #00f5ff; color: #00f5ff; box-shadow: 0 0 15px rgba(0,245,255,0.15)"
              >
                Top Music ⟶
              </A>
            </div>
          )}
        </Show>
      </main>
    </div>
  );
}
