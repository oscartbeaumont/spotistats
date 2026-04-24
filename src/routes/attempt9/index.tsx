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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt9/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt9/login"); };

  return (
    <div class="min-h-screen relative overflow-hidden" style="background: #120a1f; color: white; background-image: linear-gradient(rgba(155,0,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(155,0,255,0.05) 1px, transparent 1px); background-size: 40px 40px">
      <Title>Spotistats | Profile</Title>
      <div class="fixed inset-0 pointer-events-none">
        <div class="absolute" style="top: 0; left: 0; width: 50%; height: 50%; background: radial-gradient(circle, rgba(255,45,120,0.08) 0%, transparent 70%); filter: blur(60px)" />
        <div class="absolute" style="bottom: 0; right: 0; width: 50%; height: 50%; background: radial-gradient(circle, rgba(155,0,255,0.08) 0%, transparent 70%); filter: blur(60px)" />
      </div>
      <header class="relative z-10 px-6 py-4 flex items-center justify-between" style="background: rgba(18,10,31,0.8); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,45,120,0.15)">
        <span class="font-black text-base" style="background: linear-gradient(135deg, #ff2d78, #9b00e8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text">SPOTISTATS</span>
        <nav class="flex gap-6 text-sm">
          <A href="/attempt9" class="font-bold" style="color: #ff2d78; text-shadow: 0 0 10px rgba(255,45,120,0.4)">Profile</A>
          <A href="/attempt9/favourites" class="hover:text-white transition" style="color: rgba(255,255,255,0.4)">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs transition hover:opacity-70" style="color: rgba(155,0,255,0.5)">Logout</button>
      </header>
      <main class="relative z-10 flex items-center justify-center min-h-[85vh] px-4">
        <Show when={current()} fallback={<p class="text-sm animate-pulse" style="color: rgba(255,45,120,0.5)">♪ Loading...</p>}>
          {user => (
            <div class="text-center max-w-sm">
              <a href={user().url} target="_blank" rel="noopener" class="inline-block mb-6">
                <img
                  src={user().icon ?? "/assets/placeholder.svg"}
                  alt={user().displayName ?? "Profile"}
                  class="mx-auto h-36 w-36 rounded-full object-cover"
                  style="border: 2px solid rgba(255,45,120,0.5); box-shadow: 0 0 30px rgba(255,45,120,0.3), 0 0 60px rgba(155,0,255,0.2), inset 0 0 30px rgba(155,0,255,0.1)"
                />
              </a>
              <h1 class="text-3xl font-black mb-1" style="background: linear-gradient(135deg, #ffffff, rgba(255,255,255,0.8)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text">{user().displayName}</h1>
              <p class="text-xs tracking-widest mb-8" style="color: rgba(155,0,255,0.7)">{user().followers?.toLocaleString()} FOLLOWERS</p>
              <A
                href="/attempt9/favourites"
                class="inline-block py-3 px-8 text-sm font-bold tracking-wider uppercase transition hover:scale-[1.02]"
                style="background: linear-gradient(135deg, rgba(255,45,120,0.2), rgba(155,0,255,0.2)); border: 1px solid rgba(255,45,120,0.4); color: #ff2d78; border-radius: 0.5rem; box-shadow: 0 0 20px rgba(155,0,255,0.15)"
              >
                ♪ Top Music ⟶
              </A>
            </div>
          )}
        </Show>
      </main>
    </div>
  );
}
