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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt5/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt5/login"); };

  return (
    <div class="min-h-screen flex flex-col" style="background: #0a0a0a; color: white">
      <Title>Spotistats | Profile</Title>
      <header class="flex items-center justify-between px-8 py-5" style="border-bottom: 1px solid rgba(255,255,255,0.06)">
        <span class="font-black tracking-tighter text-lg" style="letter-spacing: -0.05em">SPOTISTATS</span>
        <nav class="flex gap-8 text-sm">
          <A href="/attempt5" class="font-bold" style="color: white">Profile</A>
          <A href="/attempt5/favourites" class="transition" style="color: rgba(255,255,255,0.35)">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs transition hover:opacity-50" style="color: rgba(255,255,255,0.3)">Sign out</button>
      </header>
      <main class="flex-1 flex">
        <Show when={current()} fallback={<div class="flex-1 flex items-center justify-center"><p class="text-sm animate-pulse" style="color: rgba(255,255,255,0.2)">Loading...</p></div>}>
          {user => (
            <div class="flex-1 flex flex-col md:flex-row">
              <div class="md:w-1/2 flex flex-col justify-center px-10 md:px-16 py-16" style="border-right: 1px solid rgba(255,255,255,0.06)">
                <p class="text-xs tracking-[0.3em] uppercase mb-6" style="color: #1DB954">Profile</p>
                <h1 class="font-black leading-none mb-4" style="font-size: clamp(2.5rem, 8vw, 5rem); letter-spacing: -0.04em; line-height: 0.92">{user().displayName?.toUpperCase()}</h1>
                <p class="text-sm mb-10" style="color: rgba(255,255,255,0.35)">{user().followers?.toLocaleString()} followers</p>
                <A href="/attempt5/favourites" class="inline-flex items-center gap-3 font-bold text-sm tracking-wider uppercase transition hover:gap-5" style="color: #1DB954">
                  <span style="display: inline-block; width: 2rem; height: 1px; background: #1DB954" />
                  View Top Music
                </A>
              </div>
              <div class="md:w-1/2 flex items-center justify-center p-10">
                <a href={user().url} target="_blank" rel="noopener">
                  <img
                    src={user().icon ?? "/assets/placeholder.svg"}
                    alt={user().displayName ?? "Profile"}
                    class="h-48 w-48 md:h-72 md:w-72 object-cover"
                    style="filter: grayscale(20%)"
                  />
                </a>
              </div>
            </div>
          )}
        </Show>
      </main>
    </div>
  );
}
